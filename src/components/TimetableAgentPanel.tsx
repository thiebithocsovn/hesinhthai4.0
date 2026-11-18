import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, CalendarDays, CheckCircle2, LockKeyhole, RefreshCcw, ShieldCheck, WandSparkles } from 'lucide-react';
import { auditTimetableSolution } from '../lib/smartTimetableAudit';
import { planTimetableAgentCommand } from '../lib/timetableAgent';
import type { TimetableScenario, TimetableSolution } from '../lib/smartTimetable';

interface Props {
  scenario: TimetableScenario;
  solution: TimetableSolution | null;
  busy: boolean;
  onApply: (next: TimetableScenario) => void;
  onRunOptimizer: () => void;
}

export default function TimetableAgentPanel({ scenario, solution, busy, onApply, onRunOptimizer }: Props) {
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [showAllErrors, setShowAllErrors] = useState(false);
  const proposal = useMemo(() => planTimetableAgentCommand(command, scenario, solution), [command, scenario, solution]);
  const audit = useMemo(() => auditTimetableSolution(scenario, solution), [scenario, solution]);
  const firstTeacher = scenario.teachers[0]?.name || 'Cô Hương';
  const firstClass = scenario.classes[0]?.name || '6A';
  const firstRoom = scenario.rooms[0]?.name || 'Phòng Tin học';
  const examples = [
    firstTeacher + ' nghỉ thứ Ba tiết 2',
    firstRoom + ' bận sáng thứ Tư',
    'Lớp ' + firstClass + ' không học thứ Sáu tiết 5',
    'Mở khóa ' + firstTeacher + ' thứ Ba tiết 2',
    'Thống kê thời khóa biểu',
  ];

  const confirm = () => {
    if (!proposal.nextScenario || proposal.status !== 'ready' || busy) return;
    onApply(proposal.nextScenario);
    setNotice('Đã cập nhật ràng buộc theo yêu cầu. Thời khóa biểu cũ được giữ trong lịch sử; hãy bấm “Xếp lại” để tạo phương án mới.');
    setCommand('');
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 md:p-7">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Bot className="h-6 w-6" /></div>
          <div><h2 className="text-xl font-extrabold text-slate-900">Trợ lý thời khóa biểu</h2><p className="text-sm text-slate-600">Hiểu lệnh tiếng Việt · xem trước · xác nhận · xếp lại</p></div>
          <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Hoạt động không cần API key</span>
        </div>
        <label htmlFor="timetable-agent-command" className="mb-2 block text-sm font-bold text-slate-700">Yêu cầu của bạn</label>
        <textarea
          id="timetable-agent-command"
          value={command}
          onChange={event => { setCommand(event.target.value); setNotice(''); }}
          placeholder="Ví dụ: Cô Hương nghỉ thứ Ba tiết 2"
          rows={3}
          maxLength={500}
          className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500">Chỉ diễn giải những lệnh có đối tượng, ngày và phạm vi rõ ràng. Trợ lý không tự sửa lịch, không gửi thông tin giáo viên lên dịch vụ AI bên ngoài.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map(example => <button key={example} type="button" onClick={() => { setCommand(example); setNotice(''); }} className="rounded-full border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100">{example}</button>)}
        </div>
      </section>

      {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">{notice}</div>}

      {command.trim() && <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          {proposal.status === 'ready' ? <LockKeyhole className="h-5 w-5 text-indigo-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          <h3 className="text-lg font-extrabold">{proposal.status === 'ready' ? 'Xem trước thay đổi (chưa áp dụng)' : 'Kết quả phân tích lệnh'}</h3>
        </div>
        <p className="mt-3 font-semibold">{proposal.title}</p>
        <ul className="mt-2 list-inside list-disc space-y-2 text-sm leading-6 text-slate-600">{proposal.details.map((line, i) => <li key={i}>{line}</li>)}</ul>
        {proposal.status === 'ready' && <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={confirm} disabled={busy} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />Xác nhận thay đổi</button>
          <button type="button" onClick={() => setCommand('')} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold">Hủy</button>
        </div>}
      </section>}

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><h3 className="font-extrabold">Kiểm toán độc lập</h3></div>
          <p className="mt-2 text-sm text-slate-500">Kiểm tra riêng, không sử dụng kết luận của bộ giải làm kết quả xác minh.</p>
          {!solution ? <p className="mt-4 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">Chưa có phương án để kiểm tra. Hãy chạy xếp lịch.</p> :
          <div className="mt-4 space-y-3">
            <div className={audit.valid && audit.complete ? 'rounded-xl bg-emerald-50 p-4 text-emerald-800' : 'rounded-xl bg-amber-50 p-4 text-amber-800'}>
              <div className="text-lg font-extrabold">{audit.valid && audit.complete ? 'Đạt kiểm toán độc lập' : 'Cần xử lý trước khi công bố'}</div>
              <div className="mt-1 text-sm">Đã xếp {audit.placedPeriods}/{audit.expectedPeriods} tiết · {audit.errors.length} lỗi</div>
            </div>
            {audit.errors.slice(0, showAllErrors ? audit.errors.length : 5).map((error, i) =>
              <p key={i} className="rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>)}
            {audit.errors.length > 5 && <button type="button" onClick={() => setShowAllErrors(!showAllErrors)} className="text-sm font-semibold text-indigo-700">{showAllErrors ? 'Thu gọn' : 'Xem đầy đủ ' + audit.errors.length + ' lỗi'}</button>}
          </div>}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-indigo-600" /><h3 className="font-extrabold">Bộ xếp lịch</h3></div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Bộ giải trình duyệt vẫn hoạt động khi không có mạng. Xếp lại sau khi phê duyệt thay đổi để kiểm tra mọi ràng buộc.</p>
          <button type="button" onClick={onRunOptimizer} disabled={busy || !scenario.assignments.length} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50">
            {busy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            {busy ? 'Đang xếp lịch...' : 'Xếp lại thời khóa biểu'}
          </button>
          <p className="mt-4 text-xs leading-5 text-slate-500">Kết quả của bộ giải heuristic không được tự nhận là tối ưu tuyệt đối. CP-SAT là mô-đun máy chủ riêng, chỉ hoạt động sau khi triển khai dịch vụ an toàn.</p>
        </div>
      </section>
    </div>
  );
}
