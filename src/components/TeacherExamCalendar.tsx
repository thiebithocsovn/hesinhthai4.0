import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from 'lucide-react';

interface ScheduledExam {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'closed';
  startTime?: string;
  durationMinutes: number;
}
interface Props {
  exams: readonly ScheduledExam[];
  onOpenExam: (id: string) => void;
  onCreateAt: (dateKey: string) => void;
}
function dayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
function dateForExam(exam: ScheduledExam): Date | null {
  const ms = exam.startTime ? Date.parse(exam.startTime) : NaN;
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export default function TeacherExamCalendar({ exams, onOpenExam, onCreateAt }: Props) {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dayKey(new Date()));
  const scheduled = useMemo(() => exams
    .map(exam => ({ exam, date: dateForExam(exam) }))
    .filter((item): item is { exam: ScheduledExam; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [exams]);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof scheduled>();
    for (const item of scheduled) {
      const key = dayKey(item.date);
      const group = map.get(key) || [];
      group.push(item);
      map.set(key, group);
    }
    return map;
  }, [scheduled]);
  const entries = grouped.get(selectedDate) || [];
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const missingSchedule = exams.filter(exam => !dateForExam(exam));

  const moveMonth = (offset: number) => {
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return <section className="mx-auto max-w-7xl space-y-5" aria-label="Lịch thi giáo viên">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><CalendarDays className="h-6 w-6 text-teal-700" /> Lịch tổ chức kỳ thi</h2>
        <p className="mt-1 text-sm text-slate-500">Lịch được tổng hợp từ thời gian mở thi của các kỳ thi đã lưu; không làm thay đổi dữ liệu.</p>
      </div>
      <button type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(dayKey(today)); }}
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Về hôm nay</button>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5" aria-label="Lưới lịch tháng">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Tháng trước" className="rounded-lg border p-2 hover:bg-slate-50"><ChevronLeft className="h-5 w-5"/></button>
          <h3 className="text-center text-base font-bold text-slate-900">Tháng {String(month.getMonth() + 1).padStart(2,'0')}/{month.getFullYear()}</h3>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Tháng sau" className="rounded-lg border p-2 hover:bg-slate-50"><ChevronRight className="h-5 w-5"/></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 sm:gap-2">
          {['T2','T3','T4','T5','T6','T7','CN'].map(name => <div className="py-2" key={name}>{name}</div>)}
          {Array.from({length: firstWeekday}, (_,i)=><div key={'blank-' + i} aria-hidden="true" />)}
          {Array.from({length: daysInMonth}, (_, index) => {
            const day = new Date(month.getFullYear(), month.getMonth(), index + 1);
            const key = dayKey(day);
            const count = grouped.get(key)?.length || 0;
            const selected = selectedDate === key;
            const today = dayKey(new Date()) === key;
            return <button type="button" key={key} onClick={() => setSelectedDate(key)}
              aria-pressed={selected} aria-label={key + ', ' + count + ' kỳ thi'}
              className={'flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-2 transition-colors sm:min-h-20 ' +
                (selected ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-transparent hover:border-slate-200 hover:bg-slate-50')}>
              <span className={'text-sm font-semibold ' + (today ? 'rounded-full bg-teal-700 px-2 py-1 text-white' : '')}>{index + 1}</span>
              {count > 0 && <span className="mt-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 sm:text-xs">{count} kỳ</span>}
            </button>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Ngày {selectedDate.split('-').reverse().join('/')}</h3>
        <p className="mt-1 text-sm text-slate-500">{entries.length} kỳ thi đã đặt lịch</p>
        <button type="button" onClick={() => onCreateAt(selectedDate)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
          <Plus className="h-4 w-4"/> Tạo kỳ thi cho ngày này
        </button>
        <div className="mt-4 space-y-3">
          {entries.length ? entries.map(({ exam, date }) => (
            <button type="button" key={exam.id} onClick={() => onOpenExam(exam.id)}
              className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-teal-200 hover:bg-teal-50">
              <span className="block font-semibold text-slate-800">{exam.title}</span>
              <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5"/>{date.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' })} · {exam.durationMinutes} phút</span>
              <span className="mt-1 block text-xs text-slate-500">{exam.status === 'draft' ? 'Bản nháp' : exam.status === 'closed' ? 'Đã đóng' : 'Đã công bố'}</span>
            </button>
          )) : <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Chưa có kỳ thi vào ngày này.</p>}
        </div>
      </section>
    </div>
    {missingSchedule.length > 0 && <section className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
      <h3 className="font-semibold text-amber-900">{missingSchedule.length} kỳ thi chưa đặt lịch hợp lệ</h3>
      <p className="mt-1 text-sm text-amber-800">Các kỳ thi này vẫn được giữ nguyên và có thể được mở thủ công theo quyền giáo viên.</p>
      <div className="mt-3 flex flex-wrap gap-2">{missingSchedule.map(exam =>
        <button type="button" key={exam.id} className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:underline" onClick={() => onOpenExam(exam.id)}>{exam.title}</button>
      )}</div>
    </section>}
  </section>;
}
