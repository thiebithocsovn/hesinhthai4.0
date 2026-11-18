import type { ScheduleEntry, TimetableScenario, TimetableSolution } from './smartTimetable.js';
import { auditTimetableSolution } from './smartTimetableAudit.js';
import { assignmentClassIds, assignmentStudentGroupIds, assignmentTeacherIds } from './smartTimetableResources.js';

export interface TimetablePublicationOptions { title: string; effectiveFrom: string; effectiveTo: string; notes: string; showTeacherNames: boolean }
export interface PublicTimetableSnapshot {
  schema: 1; school: string; title: string; effectiveFrom: string; effectiveTo: string; notes: string; createdAt: string;
  days: number; periodsPerDay: number; morningPeriods: number;
  classes: { id: string; name: string }[]; teachers: { id: string; name: string }[]; subjects: { id: string; name: string }[]; rooms: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  entries: Pick<ScheduleEntry, 'id' | 'classId' | 'teacherId' | 'subjectId' | 'roomId' | 'additionalClassIds' | 'additionalTeacherIds' | 'studentGroupId' | 'additionalStudentGroupIds' | 'dayIndex' | 'period'>[];
}

export function makePublicTimetable(s: TimetableScenario, solution: TimetableSolution, options: TimetablePublicationOptions): PublicTimetableSnapshot {
  const audit = auditTimetableSolution(s, solution);
  if (!audit.valid || !audit.complete || !audit.expectedPeriods) throw new Error('Chỉ công bố phương án có đủ tiết và vượt qua kiểm tra độc lập. ' + audit.errors.slice(0, 3).join(' '));
  const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  if (!validDate(options.effectiveFrom) || !validDate(options.effectiveTo)) throw new Error('Ngày áp dụng không hợp lệ.');
  if (options.effectiveFrom && options.effectiveTo && options.effectiveFrom > options.effectiveTo) throw new Error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
  const map = (items: { id: string; name: string }[], prefix: string) => new Map(items.map((x, i) => [x.id, `${prefix}${i + 1}`]));
  const c = map(s.classes, 'c'), t = map(s.teachers, 't'), m = map(s.subjects, 'm'), r = map(s.rooms, 'r'), g = map(s.studentGroups || [], 'g');
  const entity = (items: { id: string; name: string }[], ids: Map<string, string>) => items.map(x => ({ id: ids.get(x.id)!, name: x.name.slice(0, 200) }));
  return { schema: 1, school: s.name.slice(0, 300), title: (options.title || 'Thời khóa biểu').slice(0, 300), effectiveFrom: options.effectiveFrom, effectiveTo: options.effectiveTo, notes: options.notes.slice(0, 2000), createdAt: new Date().toISOString(),
    days: s.daysPerWeek === 6 ? 6 : 5, periodsPerDay: s.periodsPerDay, morningPeriods: s.morningPeriods || 5,
    classes: entity(s.classes, c), teachers: s.teachers.map((x, i) => ({ id: t.get(x.id)!, name: options.showTeacherNames ? x.name.slice(0, 200) : `Giáo viên ${i + 1}` })), subjects: entity(s.subjects, m), rooms: entity(s.rooms, r), groups: entity(s.studentGroups || [], g),
    entries: solution.entries.map((e, i) => ({ id: `e${i + 1}`, classId: c.get(e.classId)!, teacherId: t.get(e.teacherId)!, subjectId: m.get(e.subjectId)!, roomId: e.roomId ? r.get(e.roomId) : undefined,
      additionalClassIds: assignmentClassIds(e).slice(1).map(id => c.get(id)!), additionalTeacherIds: assignmentTeacherIds(e).slice(1).map(id => t.get(id)!), studentGroupId: e.studentGroupId ? g.get(e.studentGroupId) : undefined, additionalStudentGroupIds: assignmentStudentGroupIds(e).filter(id => id !== e.studentGroupId).map(id => g.get(id)!), dayIndex: e.dayIndex, period: e.period })),
  };
}

export function validatePublicTimetable(value: unknown): value is PublicTimetableSnapshot {
  if (!value || typeof value !== 'object') return false;
  const x = value as PublicTimetableSnapshot;
  return x.schema === 1 && typeof x.school === 'string' && typeof x.title === 'string' && Array.isArray(x.classes) && Array.isArray(x.teachers) && Array.isArray(x.subjects) && Array.isArray(x.rooms) && Array.isArray(x.entries) && x.entries.length <= 20000 && x.days >= 5 && x.days <= 6 && x.periodsPerDay >= 1 && x.periodsPerDay <= 12;
}

/** Portable public viewer. Only the explicit, redacted snapshot is embedded; no workspace or credentials. */
export function publicTimetableHtml(snapshot: PublicTimetableSnapshot): string {
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tra cứu thời khóa biểu AITHEROVA</title><style>body{font:14px Arial,sans-serif;margin:0;background:#f3f6fb;color:#1e293b}main{max-width:1300px;margin:auto;padding:24px}header{background:#253b83;color:white;padding:24px;border-radius:12px}h1{font-size:24px}p{line-height:1.7}select,button{padding:10px;border:1px solid #ccd6e5;border-radius:6px;background:white;margin:14px 8px 14px 0}table{width:100%;border-collapse:collapse;min-width:700px;background:white}td,th{border:1px solid #dbe3ee;padding:12px;text-align:center}th{background:#edf2fb}td{height:60px;font-size:12px;line-height:1.8;vertical-align:top}.table{overflow:auto}small{color:#64748b;display:block}footer{margin-top:18px;color:#64748b;font-size:11px}@media print{select,button{display:none}header{color:black;background:white}main{padding:0}table{min-width:0}}</style><main><header><div>AITHEROVA · TRA CỨU THỜI KHÓA BIỂU</div><h1 id="school"></h1><h2 id="title"></h2><p id="dates"></p></header><select id="mode" aria-label="Xem theo"><option value="class">Theo lớp</option><option value="teacher">Theo giáo viên</option><option value="room">Theo phòng</option></select><select id="resource" aria-label="Chọn đối tượng"></select><button id="print">In / PDF</button><div class="table"><table><thead id="head"></thead><tbody id="body"></tbody></table></div><p id="notes"></p><footer>Được xuất từ AITHEROVA Smart Timetable. Đây là bản chụp tại thời điểm xuất; kiểm tra ngày áp dụng trước khi sử dụng.</footer></main><script type="application/json" id="data">${json}</script><script>
const d=JSON.parse(document.getElementById('data').textContent), $=id=>document.getElementById(id), named=(items,id)=>items.find(x=>x.id===id)?.name||'', text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e};
$('school').textContent=d.school;$('title').textContent=d.title;$('dates').textContent=[d.effectiveFrom?'Từ '+d.effectiveFrom:'',d.effectiveTo?'Đến '+d.effectiveTo:''].filter(Boolean).join(' · ');$('notes').textContent=d.notes;
function draw(){const mode=$('mode').value,id=$('resource').value,head=document.createElement('tr');head.append(text('th','Tiết'));for(let day=0;day<d.days;day++)head.append(text('th','Thứ '+(day+2)));$('head').replaceChildren(head);$('body').replaceChildren();for(let p=1;p<=d.periodsPerDay;p++){const row=document.createElement('tr');row.append(text('th',String(p)));for(let day=0;day<d.days;day++){const cell=document.createElement('td'),entries=d.entries.filter(e=>e.dayIndex===day&&e.period===p&&(mode==='class'?[e.classId,...(e.additionalClassIds||[])].includes(id):mode==='teacher'?[e.teacherId,...(e.additionalTeacherIds||[])].includes(id):e.roomId===id));for(const e of entries){const line=document.createElement('div');line.append(text('strong',named(d.subjects,e.subjectId)));if(e.studentGroupId||e.additionalStudentGroupIds?.length)line.append(text('small',[e.studentGroupId,...(e.additionalStudentGroupIds||[])].filter(Boolean).map(id=>named(d.groups,id)).join(' + ')));line.append(text('small',mode==='class'?[e.teacherId,...(e.additionalTeacherIds||[])].map(id=>named(d.teachers,id)).join(' + '):[e.classId,...(e.additionalClassIds||[])].map(id=>named(d.classes,id)).join(' + ')));if(e.roomId)line.append(text('small',named(d.rooms,e.roomId)));cell.append(line)}row.append(cell)}$('body').append(row)}}
function resources(){const items=$('mode').value==='class'?d.classes:$('mode').value==='teacher'?d.teachers:d.rooms;$('resource').replaceChildren(...items.map(x=>{const e=text('option',x.name);e.value=x.id;return e}));draw()}$('mode').addEventListener('change',resources);$('resource').addEventListener('change',draw);$('print').addEventListener('click',()=>window.print());resources();
</script></html>`;
}
