import assert from 'node:assert/strict';
import { withExamStudentClass } from '../src/lib/examStudentClasses';
import { readFileSync } from 'node:fs';
import { gradeSubmittedExam, pendingTeacherPrintResults, TeacherExamPrintQueue, type TeacherPrintQueueDependencies, type TeacherPrintResult } from '../src/lib/teacherExamPrinting';
import { printExamReceipt, type ReceiptExam } from '../src/lib/examReceipt';

const exam: ReceiptExam = { id: 'exam', title: 'Toán 8', durationMinutes: 45, questions: [{ id: 'q', text: '1+1', options: ['2','3'], correctAnswer: 0 }], shuffledVersions: [{ code: 'B', questions: [{ id: 'q', text: '1+1', options: ['3','2'], correctAnswer: 1 }] }] };
const since = '2026-10-04T14:00:00Z';
const make = (id: string, offset = 0): TeacherPrintResult => ({ id, examId: 'exam', studentId: id, teacherId: 'teacher', submittedAt: new Date(Date.parse(since) + offset).toISOString(), score: 999, totalQuestions: 1, answers: { q: 1 }, examVersion: 'B' });
assert.deepEqual(gradeSubmittedExam(exam, make('s')), { score: 1, totalQuestions: 1 });
assert.deepEqual(gradeSubmittedExam(exam, { ...make('s'), answers: withExamStudentClass({ q: 1 }, 'class8a') }), { score: 1, totalQuestions: 1 });
assert.equal(gradeSubmittedExam(exam, { ...make('s'), examVersion: 'Gốc' }).score, 0);
assert.throws(() => gradeSubmittedExam(exam, { ...make('s'), examVersion: 'missing' }));
assert.throws(() => gradeSubmittedExam(exam, { ...make('s'), totalQuestions: 2 }));
assert.throws(() => gradeSubmittedExam(exam, { ...make('s'), examId: 'other' }));
const state = { status: 'sent' as const, stationId: 'first', claimedAt: since, updatedAt: since };
const rows = [make('new', 3), make('old', -30), { ...make('other'), teacherId: 'another' }, { ...make('different'), examId: 'another' }, { ...make('sent'), teacherPrint: state }, { ...make('uncertain'), teacherPrint: { ...state, status: 'dispatching' as const } }];
assert.deepEqual(pendingTeacherPrintResults(rows, 'teacher', 'exam', since).map(r=>r.id), ['new']);
assert.deepEqual(pendingTeacherPrintResults(rows, 'teacher', 'exam', since, Date.now(), ['new']).map(r=>r.id), ['old']);
assert.equal(pendingTeacherPrintResults([{ ...make('drift', -3_600_000) }], 'teacher', 'exam', since, Date.now(), []).length, 1, 'A new submission survives student clock drift.');
assert.equal(pendingTeacherPrintResults([{ ...make('claimed'), teacherPrint: { ...state, status: 'claimed' } }], 'teacher', 'exam', since, Date.parse(since)+61_000).length, 1);

const cloud = new Map<string, string>();
const events: string[] = [];
let concurrent = 0, maximum = 0;
const dependencies: TeacherPrintQueueDependencies = {
  claim: async r => { if (cloud.has(r.id)) return null; cloud.set(r.id, 'claimed'); return r; },
  prepare: async r => ({ html: r.id, ...gradeSubmittedExam(exam, r), studentName: r.studentId }),
  markDispatching: async r => { cloud.set(r.id, 'dispatching'); events.push('graded:'+r.id); return true; },
  print: async html => { concurrent++; maximum=Math.max(maximum,concurrent); events.push('print:'+html); await new Promise(resolve=>setTimeout(resolve,1)); concurrent--; },
  markSent: async r => { cloud.set(r.id, 'sent'); },
  markFailed: async r => { cloud.set(r.id, 'failed'); },
  report: () => {},
};
const queue = new TeacherExamPrintQueue(dependencies);
const burst = Array.from({length:30},(_,i)=>make('s'+i,i));
queue.add([...burst].reverse()); queue.add(burst); await queue.idle();
assert.equal(maximum,1, 'Only one browser print cycle can be active.');
assert.deepEqual(events.filter(x=>x.startsWith('print:')),burst.map(r=>'print:'+r.id));
for(const r of burst) assert.ok(events.indexOf('graded:'+r.id)<events.indexOf('print:'+r.id));
const reopened = new TeacherExamPrintQueue(dependencies); reopened.add(burst); await reopened.idle();
assert.equal(events.filter(x=>x.startsWith('print:')).length,30,'Reload never reprints acknowledged jobs.');
const twoA=new TeacherExamPrintQueue(dependencies),twoB=new TeacherExamPrintQueue(dependencies);
twoA.add([make('race')]);twoB.add([make('race')]);await Promise.all([twoA.idle(),twoB.idle()]);
assert.equal(events.filter(x=>x==='print:race').length,1,'Two teacher stations share one cloud claim.');
let uncertain=false;
const failedAck=new TeacherExamPrintQueue({...dependencies,markSent:async()=>{throw new Error('offline after dispatch');},report:(_,status)=>{uncertain=status==='uncertain';}});
failedAck.add([make('ack')]);await failedAck.idle();assert.ok(uncertain);assert.equal(cloud.get('ack'),'dispatching');
const recover=new TeacherExamPrintQueue(dependencies);recover.add([make('ack')]);await recover.idle();assert.equal(events.filter(x=>x==='print:ack').length,1);
let beforeDispatch=true;
const badVersion=new TeacherExamPrintQueue({...dependencies,prepare:async()=>{throw new Error('Wrong version');},report:(_,status)=>{beforeDispatch=status==='failed';}});
badVersion.add([make('bad')]);await badVersion.idle();assert.ok(beforeDispatch);assert.equal(cloud.get('bad'),'failed');assert.ok(!events.includes('print:bad'));
const stopped = new TeacherExamPrintQueue(dependencies);stopped.stop();stopped.add([make('stopped')]);await stopped.idle();assert.ok(!cloud.has('stopped'));

let preparationAttempts=0;
const transient=new TeacherExamPrintQueue({...dependencies,
  claim:async r=>{cloud.set(r.id,'claimed');return r;},
  prepare:async r=>{if(++preparationAttempts===1)throw Object.assign(new Error('temporarily offline'),{code:'unavailable'});return dependencies.prepare(r);},
});
transient.add([make('transient')]);await transient.idle();assert.equal(cloud.get('transient'),'claimed');assert.ok(!events.includes('print:transient'));
transient.add([make('transient')]);await transient.idle();assert.equal(cloud.get('transient'),'sent');assert.equal(events.filter(x=>x==='print:transient').length,1);
let claims=0;
const recoverClaim=new TeacherExamPrintQueue({...dependencies,claim:async r=>++claims===1?null:dependencies.claim(r)});
recoverClaim.add([make('reclaim')]);await recoverClaim.idle();recoverClaim.add([make('reclaim')]);await recoverClaim.idle();assert.equal(events.filter(x=>x==='print:reclaim').length,1,'A rejected claim can be checked again after its lease expires.');

// Exercise the actual print helper: it must wait for afterprint before releasing its frame.
let frame: any = null;
let afterPrint: (()=>void) | undefined;
let removed=false;
const target={requestAnimationFrame:(fn:()=>void)=>queueMicrotask(fn),addEventListener:(_:string,fn:()=>void)=>{afterPrint=fn;},focus:()=>{},print:()=>{events.push('browser-print');}};
(globalThis as any).window={setTimeout,clearTimeout};
(globalThis as any).document={getElementById:()=>frame,createElement:()=>({style:{},contentWindow:target,contentDocument:{fonts:{ready:Promise.resolve()}},remove(){removed=true;frame=null;}}),body:{appendChild(value:any){frame=value;queueMicrotask(()=>value.onload());}}};
let resolved=false;
const printing=printExamReceipt('<html>Phiếu</html>').then(()=>{resolved=true;});
await new Promise(resolve=>setTimeout(resolve,10));assert.ok(!resolved && !removed);await assert.rejects(printExamReceipt('duplicate'));afterPrint!();await printing;assert.ok(resolved && removed);

const pupil=readFileSync(new URL('../src/components/UnifiedStudentExamRunner.tsx',import.meta.url),'utf8');
assert.ok(!pupil.includes('printExamReceipt('),'Student submission never invokes automatic printing.');
assert.ok(pupil.includes('teacherPrinting ? [] : activeExam.questions'),'Central mode sends answers for teacher-side grading.');
console.info('Teacher printing passed: authoritative grading, versions, tenant isolation, old results, clock drift, 30-job burst, cross-station claims, reload, failures and print lifecycle.');
