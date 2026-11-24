import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, LayoutGrid, Save } from 'lucide-react';
import { assessExamReadiness, type ReadinessExam } from '../lib/examReadiness';
import { questionMaxPoints, type GradableQuestion } from '../lib/examManualGrading';
import { LEVELS, blueprintRows, eligibleRoster, makeRooms, buildOperationsCsv, type ExamOperationsPlan, type CognitiveLevel, type RosterClass, type RosterStudent, type ProgressQuestion } from '../lib/examOperations';
import { isExamProfile, EXAM_PROFILES } from '../lib/examCandidateWorkspace';

interface OperationsQuestion extends ProgressQuestion, GradableQuestion {
  text: string;
  options: string[];
  correctAnswer: number;
  matchingPairs?: {id:string;left:string;right:string}[];
}
interface OperationsExam extends ReadinessExam {
  questions: OperationsQuestion[];
  operationsPlan?: ExamOperationsPlan;
  examProfile?: string;
}
interface Props {
  exams: readonly OperationsExam[];
  students: readonly RosterStudent[];
  classes: readonly RosterClass[];
  rosterReady: boolean;
  onSave: (examId: string, plan: ExamOperationsPlan) => Promise<void>;
  onEdit: (id: string) => void;
  onMonitoring: (id: string) => void;
}
function downloadCsv(name: string, rows: readonly (readonly unknown[])[]) {
  const url = URL.createObjectURL(new Blob([buildOperationsCsv(rows)], {type:'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function TeacherExamOperations(props: Props) {
  const [id, setId] = useState('');
  const exam = props.exams.find(e=>e.id === id) || props.exams[0];
  return <section className="mx-auto max-w-7xl space-y-5">
    <header><h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><LayoutGrid className="h-6 w-6 text-teal-700"/> Chuẩn bị & tổ chức thi</h2>
      <p className="mt-1 text-sm text-slate-500">Ma trận đề, kế hoạch phân phòng và kiểm tra điều kiện tổ chức, dùng danh sách học sinh đã lưu.</p></header>
    <label className="block rounded-xl border bg-white p-4 text-sm font-semibold">Kỳ thi
      <select value={exam?.id || ''} onChange={e=>setId(e.target.value)} className="mt-2 block w-full rounded-lg border p-2 font-normal">
        {!exam && <option value="">Chưa có kỳ thi</option>}
        {props.exams.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}
      </select>
    </label>
    {exam ? <PlanEditor key={exam.id + ':' + (exam.operationsPlan?.updatedAt || '')} exam={exam} {...props}/> : <p className="rounded-xl bg-white p-6 text-slate-500">Tạo một kỳ thi trước khi lập kế hoạch.</p>}
  </section>;
}
function PlanEditor({exam, students, classes, rosterReady, onSave, onEdit, onMonitoring}: Props & {exam:OperationsExam}) {
  const previous = exam.operationsPlan?.version === 1 ? exam.operationsPlan : undefined;
  const [classIds,setClassIds] = useState<string[]>(previous?.selectedClassIds || []);
  const [capacity,setCapacity] = useState(previous?.capacity || 24);
  const [levels,setLevels] = useState<Record<string,CognitiveLevel>>(previous?.levels || {});
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [checklist,setChecklist] = useState<Record<string,boolean>>({});
  const editable = exam.status === 'draft';
  const ownedClasses = classes.filter(c=>c.teacherId === exam.teacherId);
  const roster = useMemo(()=>eligibleRoster(students,classes,exam.teacherId || '',classIds),[students,classes,exam.teacherId,classIds]);
  const rosterById = new Map(students.filter(s=>s.teacherId === exam.teacherId).map(s=>[s.id,s]));
  const classById = new Map(ownedClasses.map(c=>[c.id,c.name]));
  const validCapacity = Number.isInteger(capacity) && capacity >= 1 && capacity <= 100;
  const generated = validCapacity && roster.length <= 1000 ? makeRooms(roster,capacity) : [];
  const rooms = editable ? generated : previous?.rooms || [];
  const rows = blueprintRows(exam.questions,levels,questionMaxPoints);
  const missing = rows.reduce((sum,row)=>sum+row.counts[4],0);
  const readiness = assessExamReadiness(exam);
  const blocking = readiness.filter(i=>i.level === 'blocker').length;
  const count = rooms.reduce((n,room)=>n+room.seats.length,0);
  const save = async () => {
    if (!editable || !rosterReady || !validCapacity || roster.length > 1000 || busy) return;
    setBusy(true);setMessage('');setError('');
    try {
      const valid = Object.fromEntries(exam.questions.flatMap(q=>LEVELS.includes(levels[q.id]) ? [[q.id,levels[q.id]]] : []));
      await onSave(exam.id,{version:1,selectedClassIds:classIds.filter(id=>classById.has(id)),capacity,rooms:generated,levels:valid,updatedAt:new Date().toISOString()});
      setMessage('Đã lưu kế hoạch vào kỳ thi.');
    } catch (e) {setError(e instanceof Error ? e.message : 'Không lưu được kế hoạch.');}
    finally {setBusy(false);}
  };
  const exportRooms = () => downloadCsv('Danh_sach_phong_' + exam.id,[
    ['Kỳ thi',exam.title],['Nguồn',editable ? 'Kế hoạch đang xem – cần kiểm tra trước khi dùng' : 'Kế hoạch đã lưu'],['Phòng','Chỗ ngồi','Họ tên','Lớp','Mã thí sinh nội bộ'],
    ...rooms.flatMap(room=>room.seats.map(seat=>{
      const student=rosterById.get(seat.studentId);
      return [room.name,seat.seat,student?.name || '(Không còn trong danh sách)',classById.get(student?.classId || '') || '',seat.studentId];
    })),
  ]);
  const exportMatrix = () => downloadCsv('Ma_tran_' + exam.id,[
    ['Kỳ thi',exam.title],['Dạng câu',...LEVELS,'Chưa phân loại','Tổng câu','Điểm cấu hình'],
    ...rows.map(row=>[row.group,...row.counts,row.total,row.points]),
    [],['Câu','Mã câu','Mức độ','Điểm cấu hình'],
    ...exam.questions.map((q,index)=>[index+1,q.id,levels[q.id] || 'Chưa phân loại',questionMaxPoints(q)]),
  ]);
  return <>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
      <div className="min-w-0 flex-1"><p className="font-bold">{exam.title}</p><p className="text-xs text-slate-500">{isExamProfile(exam.examProfile)?EXAM_PROFILES[exam.examProfile].label:'Đề tương thích cũ'} · {exam.durationMinutes} phút · {exam.questions.length} câu · {editable?'Bản nháp':'Đã công bố/đóng'}</p></div>
      <button type="button" onClick={()=>onEdit(exam.id)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Mở đề thi</button>
      <button type="button" onClick={()=>onMonitoring(exam.id)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Giám sát</button>
      <button type="button" disabled={!editable || !rosterReady || !validCapacity || roster.length>1000 || busy} onClick={()=>void save()} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Save size={16}/>{busy?'Đang lưu…':'Lưu kế hoạch'}</button>
      {message&&<p role="status" className="w-full text-sm text-green-800">{message}</p>}{error&&<p role="alert" className="w-full text-sm text-red-800">{error}</p>}
      {!editable&&<p className="w-full text-xs text-amber-800">Kế hoạch đã công bố chỉ được xem, không sửa. Không thay đổi dữ liệu của lượt thi cũ.</p>}
    </div>
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">1. Ma trận đề theo mức độ nhận thức</h3><button type="button" onClick={exportMatrix} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><Download size={15}/>Xuất CSV</button></div>
      <p className="mt-1 text-xs text-slate-500">{missing} câu chưa phân loại. Đây là ma trận do giáo viên khai báo, không tự gán mức độ hay khẳng định đạt chuẩn Bộ GD&ĐT.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50"><tr>{['Dạng câu',...LEVELS,'Chưa gán','Tổng','Điểm'].map(label=><th key={label} className="px-2 py-3">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map(row=><tr key={row.group}><td className="p-2 font-medium">{row.group}</td>{row.counts.map((n,i)=><td className="p-2" key={i}>{n}</td>)}<td className="p-2">{row.total}</td><td className="p-2">{Number(row.points.toFixed(2))}</td></tr>)}</tbody></table></div>
      <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border divide-y">
        {exam.questions.map((q,i)=><label key={q.id} className="flex flex-wrap items-center gap-2 p-2 text-sm"><span className="min-w-0 flex-1 truncate">Câu {i+1}. {q.text.replace(/<[^>]*>/g,' ').slice(0,140) || 'Nội dung đa phương tiện'}</span><select aria-label={'Mức độ câu '+(i+1)} disabled={!editable} value={levels[q.id]||''} onChange={e=>{const level=e.target.value as CognitiveLevel;setLevels(old=>{const next={...old};if(LEVELS.includes(level))next[q.id]=level;else delete next[q.id];return next;});}} className="rounded border p-1.5"><option value="">Chưa phân loại</option>{LEVELS.map(level=><option key={level}>{level}</option>)}</select></label>)}
      </div>
    </section>
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">2. Kế hoạch phòng thi và chỗ ngồi</h3><button type="button" disabled={!rosterReady || !rooms.length} onClick={exportRooms} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40"><Download size={15}/>Xuất danh sách</button></div>
      <p className="mt-1 text-xs text-slate-500">Chỉ gồm học sinh đã đăng ký lớp thuộc giáo viên của kỳ thi; không gồm tài khoản khách. Đây là kế hoạch phân phòng, không giới hạn quyền vào thi hay phân quyền giám thị.</p>
      {!rosterReady&&<p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Chưa xác nhận tải đủ danh sách lớp/học sinh từ máy chủ.</p>}
      <fieldset disabled={!editable || !rosterReady} className="mt-4">
        <legend className="text-sm font-semibold">Chọn lớp dự thi</legend>
        <div className="mt-2 flex flex-wrap gap-2">{ownedClasses.map(c=><label key={c.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={classIds.includes(c.id)} onChange={e=>setClassIds(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.name}</label>)}</div>
        <label className="mt-3 block text-sm font-medium">Sức chứa tối đa mỗi phòng (1–100)<input type="number" min={1} max={100} value={capacity} onChange={e=>setCapacity(Number(e.target.value))} className="ml-3 w-24 rounded border px-2 py-1.5"/></label>
      </fieldset>
      {!validCapacity&&<p className="mt-2 text-sm text-red-700">Sức chứa không hợp lệ.</p>}
      {roster.length>1000&&<p className="mt-2 text-sm text-red-700">Quá 1.000 học sinh, cần chia đợt thi.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Thí sinh trong kế hoạch</p><strong className="text-xl">{count}</strong></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Phòng thi</p><strong className="text-xl">{rooms.length}</strong></div></div>
      <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">{rooms.map(room=><details key={room.name} className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">{room.name} · {room.seats.length} học sinh</summary><ol className="mt-2 grid gap-1 sm:grid-cols-2">{room.seats.map(seat=><li key={seat.studentId} className="rounded bg-slate-50 px-2 py-1 text-sm">{seat.seat}. {rosterById.get(seat.studentId)?.name||'Không còn trong danh sách'} · {classById.get(rosterById.get(seat.studentId)?.classId||'')||'—'}</li>)}</ol></details>)}</div>
    </section>
    <section className="rounded-2xl border bg-white p-4 sm:p-5">
      <h3 className="flex items-center gap-2 font-bold"><ClipboardCheck size={20}/>3. Kiểm tra trước giờ thi</h3>
      <p className="mt-2 text-sm">{blocking} lỗi nghiêm trọng của đề · {readiness.length-blocking} cảnh báo · {missing} câu chưa phân loại</p>
      {readiness.slice(0,8).map((issue,i)=><p key={i} className="mt-1 text-xs text-amber-900">{issue.message}</p>)}
      <p className="mt-3 text-xs text-slate-500">Danh sách tự kiểm tra tại thiết bị hiện tại; không phải biên bản kiểm định và không tự động mở thi.</p>
      {['Đã thử đăng nhập bằng tài khoản học sinh','Đã thử lưu bài khi mạng gián đoạn và kết nối lại','Đã đối chiếu đáp án và thang điểm với đề gốc','Đã thử nộp, xem kết quả và in phiếu','Đã kiểm tra máy dự phòng, mạng và nguồn điện'].map(label=><label key={label} className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!checklist[label]} onChange={e=>setChecklist(old=>({...old,[label]:e.target.checked}))}/>{label}</label>)}
    </section>
  </>;
}
