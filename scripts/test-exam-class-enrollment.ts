import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatStudentName,isFullStudentName} from '../src/lib/studentNameNormalization';
import {planClassEnrollment} from '../src/lib/examEnrollmentPlan';
import {withExamStudentClass} from '../src/lib/examStudentClasses';
import {createPrivateStudentRosterDirectory,createStudentRosterLookupKey} from '../src/lib/teacherIsolation';
import {eligibleRoster} from '../src/lib/examOperations';
assert.equal(formatStudentName('  bÉ   THU HÀ '),'Bé Thu Hà');
assert.equal(formatStudentName('ĐỖ HOÀNG MINH QUÂN'),'Đỗ Hoàng Minh Quân');
assert.equal(formatStudentName('Nguye\u0302\u0303n văn an'),'Nguyễn Văn An');
assert.equal(formatStudentName('chu hải minh'),'Chu Hải Minh');
assert.equal(isFullStudentName('dương'),false);
assert.equal(isFullStudentName('Nguyễn Văn 123'),false);
assert.equal(isFullStudentName('Đỗ Diệu Hương'),true);
const owner='owner',classId='class-a';
const exam={id:'exam-a',teacherId:owner,title:'Tin học',classNames:{'class-a':'4A4'}};
const students=[
  {id:'guest-a',teacherId:owner,name:'bé thu hà',examId:exam.id},
  {id:'guest-b',teacherId:owner,name:'đỗ diệu hương',examId:exam.id},
  {id:'guest-c',teacherId:owner,name:'ĐỖ DIỆU HƯƠNG',examId:exam.id},
  {id:'guest-d',teacherId:owner,name:'dương',examId:exam.id},
  {id:'guest-e',teacherId:owner,name:'Chu Hải Minh',examId:exam.id,classId:'other-class'},
  {id:'guest-f',teacherId:owner,name:'Lê Thị An',examId:exam.id,enrollmentExcluded:true},
  {id:'foreign',teacherId:'another',name:'Nguyễn Văn B',examId:exam.id}
];
const sessions=students.map(s=>({id:s.id+'_exam-a',teacherId:s.teacherId,examId:exam.id,studentId:s.id,status:'taking',lastActive:'2026-11-24T00:00:00Z',draftAnswers:withExamStudentClass({},classId)}));
const snapshot=JSON.stringify({students,sessions});
const plan=planClassEnrollment(owner,classId,students,[exam],sessions,[]);
assert.deepEqual(plan.eligible.map(s=>[s.studentId,s.name]),[['guest-a','Bé Thu Hà']]);
assert.equal(plan.review.length,5);
assert.equal(JSON.stringify({students,sessions}),snapshot);
const promoted={...students[0],classId,name:'Bé Thu Hà',selfEnrolled:true};
assert.equal(planClassEnrollment(owner,classId,[promoted],[exam],sessions,[]).eligible.length,0);
const directory=await createPrivateStudentRosterDirectory(owner,'next-exam',[promoted]);
assert.deepEqual(directory[await createStudentRosterLookupKey(owner,'next-exam','BÉ THU HÀ',classId)],{id:'guest-a',classId,selfEnrolled:true});
assert.equal(eligibleRoster([promoted],[{id:classId,name:'4A4',teacherId:owner}],owner,[classId])[0].id,'guest-a');
const sync=readFileSync(new URL('../src/lib/examEnrollmentSync.ts',import.meta.url),'utf8');
assert.ok(sync.includes('tx.update(ref,{classId,name:formatStudentName(current.name),selfEnrolled:true})'));
assert.ok(sync.includes("tx.get(doc(db,'classes',classId))")&&sync.includes('getDocsFromServer'));
assert.ok(!sync.includes('deleteDoc')&&!sync.includes("tx.set("));
console.log('Class enrollment: Vietnamese normalization, exact IDs, duplicates and incomplete names held, cross-owner checks, exclusion, and reusable official roster passed.');

const rosterPanel=readFileSync(new URL('../src/components/TeacherExamClassAttendance.tsx',import.meta.url),'utf8');
const manager=readFileSync(new URL('../src/components/ExamManagerLegacy.tsx',import.meta.url),'utf8');
assert.equal((rosterPanel.match(/<table\b/g)||[]).length,1,'The class has a single unified table.');
assert.ok(rosterPanel.includes('Học sinh trong danh sách chính thức') && rosterPanel.includes('officialIds.has(row.studentId)'));
assert.ok(!rosterPanel.includes('Học sinh dự thi ngoài danh sách lớp chính thức'));
assert.ok(rosterPanel.includes('reconcileClassEnrollment(db,ownerUid,classId)'));
assert.ok(manager.includes('onRename={handleUpdateStudent} onRemove={handleDeleteStudent}'));
assert.ok(!manager.includes('Học sinh trong danh sách chính thức ({students.filter'));
console.log('Unified roster table and live reconciliation regression passed.');
