import { useMemo, useState } from 'react';
import { BarChart3, Download, FileText } from 'lucide-react';
import type { ReceiptExam, ReceiptResult } from '../lib/examReceipt';
import { getReceiptStudentClassId, receiptQuestionIsCorrect } from '../lib/examReceipt';
import { examUsesWeightedScoring, summarizeExamScore } from '../lib/examManualGrading';

interface AnalyticResult extends ReceiptResult {
  examId: string;
  studentId: string;
}
interface StudentInfo { id: string; name: string; classId?: string }
interface ClassInfo { id: string; name: string }
interface Props {
  exams: readonly ReceiptExam[];
  results: readonly AnalyticResult[];
  students: readonly StudentInfo[];
  classes: readonly ClassInfo[];
  resultsReady: boolean;
  error?: string;
  onOpenGrading: (examId: string) => void;
}
interface ReportRow {
  id: string;
  student: string;
  classId: string;
  className: string;
  submittedAt: string;
  score10: number | null;
  pendingManual: number;
}
const RANGES = [
  { label: '0 – dưới 2', min: 0, max: 2 },
  { label: '2 – dưới 4', min: 2, max: 4 },
  { label: '4 – dưới 5', min: 4, max: 5 },
  { label: '5 – dưới 6,5', min: 5, max: 6.5 },
  { label: '6,5 – dưới 8', min: 6.5, max: 8 },
  { label: '8 – 10', min: 8, max: 10.0001 },
];
const fmt = (value: number): string => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
function csvCell(value: string | number): string {
  const safe = String(value).replace(/^[\s]*([=+@-])/u, "'$&");
  return '"' + safe.replace(/"/g, '""') + '"';
}
function getLatest(results: readonly AnalyticResult[]): AnalyticResult[] {
  const latest = new Map<string, AnalyticResult>();
  for (const result of results) {
    const existing = latest.get(result.studentId);
    if (!existing || (Date.parse(result.submittedAt) || 0) >= (Date.parse(existing.submittedAt) || 0)) {
      latest.set(result.studentId, result);
    }
  }
  return [...latest.values()];
}
export default function TeacherExamAnalytics({
  exams, results, students, classes, resultsReady, error, onOpenGrading,
}: Props) {
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('all');
  const selected = exams.find(exam => exam.id === examId) || exams[0];
  const rows = useMemo((): ReportRow[] => {
    if (!selected) return [];
    const studentById = new Map(students.map(student => [student.id, student]));
    const classById = new Map(classes.map(item => [item.id, item.name]));
    return getLatest(results.filter(item => item.examId === selected.id)).map(item => {
      const student = studentById.get(item.studentId);
      const assigned = getReceiptStudentClassId(selected, student || { id: item.studentId }, item) || '';
      const weighted = examUsesWeightedScoring(selected);
      const summary = weighted ? summarizeExamScore(selected, item, receiptQuestionIsCorrect) : null;
      const score = summary
        ? summary.complete && summary.max > 0 ? summary.score10 : null
        : item.totalQuestions > 0 && Number.isFinite(item.score)
          ? Math.round(Math.min(10, Math.max(0, item.score / item.totalQuestions * 10)) * 100) / 100
          : null;
      return {
        id: item.studentId, student: student?.name || 'Không xác định',
        classId: assigned, className: classById.get(assigned) || selected.classNames?.[assigned] || 'Chưa xếp lớp',
        submittedAt: item.submittedAt, score10: score, pendingManual: summary?.pendingManual || 0,
      };
    }).sort((a,b) => a.student.localeCompare(b.student, 'vi'));
  }, [selected, results, students, classes]);
  const visible = rows.filter(row => classId === 'all' || row.classId === classId);
  const scores = visible.flatMap(row => row.score10 === null ? [] : [row.score10]);
  const sortedScores = [...scores].sort((a,b) => a - b);
  const average = scores.length ? scores.reduce((sum,value) => sum + value, 0) / scores.length : null;
  const median = sortedScores.length ? sortedScores.length % 2
    ? sortedScores[(sortedScores.length - 1) / 2]
    : (sortedScores[sortedScores.length/2 - 1] + sortedScores[sortedScores.length/2])/2 : null;
  const pending = visible.filter(row => row.score10 === null).length;
  const histogram = RANGES.map(item => ({ ...item, count: scores.filter(score => score >= item.min && score < item.max).length }));
  const maxCount = Math.max(1, ...histogram.map(item => item.count));
  const displayClasses = [...new Map(rows.filter(row => row.classId).map(row => [row.classId, row.className])).entries()];

  const exportCsv = () => {
    if (!resultsReady || !selected) return;
    const data: (string | number)[][] = [
      ['BÁO CÁO KỲ THI', selected.title],
      ['Số bài nộp (đã loại lượt nộp trùng)', visible.length],
      ['Số bài có điểm hoàn chỉnh', scores.length],
      ['Số bài chờ chấm hoặc không đủ căn cứ tính điểm', pending],
      ['Điểm trung bình /10', average === null ? '' : fmt(average)],
      [],
      ['STT','Họ tên','Lớp','Mã học sinh','Điểm /10','Tình trạng','Thời gian nộp'],
      ...visible.map((row,i) => [i+1,row.student,row.className,row.id,
        row.score10 === null ? '' : fmt(row.score10),
        row.score10 === null ? 'Chờ chấm/kiểm tra' : 'Có điểm',
        row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN') : '']),
    ];
    const csv = '\ufeff' + data.map(line => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'Bao_cao_ky_thi_' + selected.id.replace(/[^a-z0-9_-]/gi, '') + '.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return <section className="mx-auto max-w-7xl space-y-5" aria-label="Phân tích kết quả thi">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><BarChart3 className="h-6 w-6 text-teal-700"/> Phân tích kết quả</h2>
        <p className="mt-1 text-sm text-slate-500">Chỉ tính lần nộp mới nhất mỗi học sinh. Bài chưa chấm hoàn chỉnh không được tính vào trung bình.</p>
      </div>
      <button type="button" onClick={exportCsv} disabled={!selected || !resultsReady}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 hover:bg-teal-800">
        <Download className="h-4 w-4"/> Xuất báo cáo CSV
      </button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {!resultsReady && !error && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Đang xác minh dữ liệu điểm với máy chủ. Không thể xuất báo cáo cho tới khi đồng bộ xong.</p>}
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Kỳ thi
        <select value={selected?.id || ''} onChange={e=>{ setExamId(e.target.value);setClassId('all'); }} className="mt-1 block w-full rounded-lg border p-2.5 font-normal">
          {exams.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold text-slate-700">Lớp học
        <select value={classId} onChange={e=>setClassId(e.target.value)} className="mt-1 block w-full rounded-lg border p-2.5 font-normal">
          <option value="all">Tất cả các lớp</option>
          {displayClasses.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select>
      </label>
    </div>
    {!selected ? <div className="rounded-2xl border bg-white p-12 text-center text-sm text-slate-500">Chưa có kỳ thi để báo cáo.</div> :
      <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            ['Bài đã nộp', String(visible.length)],
            ['Có điểm hoàn chỉnh', String(scores.length)],
            ['Điểm trung bình /10', average === null ? '—' : fmt(average)],
            ['Chưa chấm xong', String(pending)],
          ].map(([label,value]) =>
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            </div>)}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Phân phối điểm /10</h3>
            <p className="mt-1 text-xs text-slate-500">Chỉ dùng bài đã có điểm hoàn chỉnh</p>
            <div className="mt-5 space-y-3">
              {histogram.map(item => <div key={item.label} className="grid grid-cols-[95px_1fr_32px] items-center gap-3 text-xs sm:grid-cols-[110px_1fr_32px]">
                <span className="text-slate-600">{item.label}</span>
                <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                  <div role="img" aria-label={item.label + ': ' + item.count + ' bài'} style={{width: (item.count / maxCount * 100) + '%'}} className="h-full rounded-full bg-teal-600" />
                </div>
                <span className="text-right font-semibold tabular-nums">{item.count}</span>
              </div>)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Chỉ số thống kê</h3>
            <dl className="mt-4 divide-y divide-slate-100">
              {[
                ['Điểm thấp nhất', sortedScores.length ? fmt(sortedScores[0]) : '—'],
                ['Trung vị', median === null ? '—' : fmt(median)],
                ['Điểm cao nhất', sortedScores.length ? fmt(sortedScores[sortedScores.length-1]) : '—'],
                ['Đạt từ 5 điểm', sortedScores.length ? scores.filter(s=>s>=5).length + '/' + scores.length : '—'],
              ].map(([name,value])=><div key={name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <dt className="text-slate-600">{name}</dt><dd className="font-bold tabular-nums text-slate-900">{value}</dd>
              </div>)}
            </dl>
            {pending>0 && <button type="button" onClick={() => onOpenGrading(selected.id)}
              className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
              Mở chấm bài còn thiếu ({pending})
            </button>}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b px-5 py-4 font-bold text-slate-900"><FileText className="h-5 w-5"/> Kết quả chi tiết</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
                <th className="px-4 py-3">Họ tên</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Điểm /10</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Ngày nộp</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(row=><tr key={row.id}><td className="px-4 py-3 font-medium text-slate-800">{row.student}</td>
                  <td className="px-4 py-3">{row.className}</td>
                  <td className="px-4 py-3 font-bold">{row.score10===null?'—':fmt(row.score10)}</td>
                  <td className="px-4 py-3">{row.score10===null?'Chờ chấm / kiểm tra':'Có điểm'}</td>
                  <td className="px-4 py-3">{row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN') : '—'}</td>
                </tr>)}
                {!visible.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Chưa có bài nộp cho phạm vi này.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </>}
  </section>;
}
