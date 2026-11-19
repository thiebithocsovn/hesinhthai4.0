import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Trash2, UserRoundCheck } from 'lucide-react';
import { activeTimetableDays, type TimetableScenario, type TimetableSolution } from '../lib/smartTimetable';
import { auditTimetableSolution } from '../lib/smartTimetableAudit';
import { coverTargetEntries, proposeTimetableCover, timetableCoverSignature, validateTimetableCovers, type TimetableCover } from '../lib/timetableCover';

interface Props { scenario: TimetableScenario; solution: TimetableSolution | null; storageKey: string }
const csvField = (value: unknown) => {
  const text = String(value ?? '');
  // Guard spreadsheets against interpreting user-supplied names/notes as formulas.
  const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export default function TimetableCoverPanel({ scenario, solution, storageKey }: Props) {
  const signature = timetableCoverSignature(scenario, solution);
  const key = storageKey + ':cover:' + signature;
  const [covers, setCovers] = useState<TimetableCover[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.filter(x => x && typeof x.date === 'string' && Array.isArray(x.entryIds) && typeof x.substituteTeacherId === 'string' && typeof x.reason === 'string' && typeof x.createdAt === 'string') : [];
    } catch { return []; }
  });
  const [selectedEntry, setSelectedEntry] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const audit = useMemo(() => auditTimetableSolution(scenario, solution), [scenario, solution]);
  const valid = Boolean(solution && audit.valid && audit.complete);
  const errors = useMemo(() => validateTimetableCovers(scenario, solution, covers), [scenario, solution, covers]);
  const days = activeTimetableDays(scenario);
  const sorted = useMemo(() => (solution?.entries || []).slice().sort((a, b) => a.dayIndex - b.dayIndex || a.period - b.period || a.classId.localeCompare(b.classId)), [solution]);
  const candidates = sorted.filter((item, index) => sorted.findIndex(other => other.id === item.id || (item.blockId && other.blockId === item.blockId && other.assignmentId === item.assignmentId)) === index);
  const entry = solution?.entries.find(e => e.id === selectedEntry);
  const target = entry && solution ? coverTargetEntries(solution, selectedEntry) : [];
  const names = {
    teacher: (id: string) => scenario.teachers.find(t => t.id === id)?.name || id,
    class: (id: string) => scenario.classes.find(c => c.id === id)?.name || id,
    subject: (id: string) => scenario.subjects.find(m => m.id === id)?.name || id,
  };
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(covers)); } catch { /* device storage may be full or disabled */ } }, [key, covers]);

  const add = () => {
    if (!valid || !solution || !target.length) { setMessage('Cần một thời khóa biểu đã được kiểm tra độc lập và một tiết được chọn.'); return; }
    if (!date || !teacherId || !reason.trim()) { setMessage('Chọn ngày, giáo viên dạy thay và ghi rõ lý do.'); return; }
    const next: TimetableCover = { date, entryIds: target.map(e => e.id), substituteTeacherId: teacherId, reason: reason.trim().slice(0, 300), createdAt: new Date().toISOString() };
    const proposed = proposeTimetableCover(scenario, solution, covers, next);
    if (proposed.errors.length) { setMessage('Không thể đăng ký dạy thay: ' + proposed.errors.slice(0, 3).join(' ')); return; }
    setCovers(proposed.covers); setMessage('Đã lưu kế hoạch dạy thay trên thiết bị. Thời khóa biểu gốc và bản công bố không bị thay đổi.');
    setReason('');
  };
  const exportCsv = () => {
    if (!solution || !covers.length || errors.length) return;
    const header = ['Ngày dạy thay', 'Thứ', 'Tiết', 'Lớp', 'Môn', 'Giáo viên gốc', 'Giáo viên dạy thay', 'Lý do', 'Trạng thái'];
    const rows = covers.flatMap(c => c.entryIds.map(id => {
      const e = solution.entries.find(item => item.id === id);
      return [c.date, e ? days[e.dayIndex] : '', e?.period ?? '', e ? names.class(e.classId) : '', e ? names.subject(e.subjectId) : '', e ? names.teacher(e.teacherId) : '', names.teacher(c.substituteTeacherId), c.reason, 'Dự kiến - chưa công bố'];
    }));
    const csv = '\ufeff' + [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Ke-hoach-day-thay.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-5">
    <section className="tt-panel">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2"><UserRoundCheck size={19} />Điều động giáo viên dạy thay</h3><p className="mt-1">Dành cho một ngày cụ thể. Hệ thống kiểm tra lịch trùng, giờ bận, giới hạn tiết và thời gian chuyển cơ sở trước khi lưu.</p></div><span className="tt-badge">Lưu riêng trên thiết bị</span></div>
      {!valid && <div role="alert" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Cần xếp đủ tiết, sửa mọi xung đột và chạy kiểm tra độc lập trước khi điều động dạy thay.</div>}
      <fieldset disabled={!valid} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-semibold">Tiết học cần thay
          <select aria-label="Tiết học cần thay" value={selectedEntry} onChange={e => setSelectedEntry(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
            <option value="">Chọn tiết trong thời khóa biểu</option>
            {candidates.map(e => <option key={e.id} value={e.id}>{days[e.dayIndex]} · tiết {e.period}{e.blockId ? ' (cả block)' : ''} · {names.class(e.classId)} · {names.subject(e.subjectId)} · {names.teacher(e.teacherId)}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Ngày thực hiện
          <input type="date" aria-label="Ngày thực hiện dạy thay" value={date} onChange={e => setDate(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
        </label>
        <label className="text-xs font-semibold">Giáo viên dạy thay
          <select aria-label="Giáo viên dạy thay" value={teacherId} onChange={e => setTeacherId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
            <option value="">Chọn giáo viên</option>
            {scenario.teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.level}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Lý do điều động
          <input aria-label="Lý do dạy thay" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ví dụ: Giáo viên nghỉ phép" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
        </label>
      </fieldset>
      {target.length > 1 && <p className="mt-3 text-xs font-medium text-indigo-700">Tiết liền được điều động theo cả block ({target.length} tiết); không tách block đã xếp.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={add} disabled={!valid} className="tt-button green"><CheckCircle2 size={15} />Kiểm tra và lưu dạy thay</button><button type="button" onClick={exportCsv} disabled={!covers.length || !!errors.length} className="tt-button"><Download size={15} />Xuất danh sách CSV</button></div>
      {message && <p role="status" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-800">{message}</p>}
      {errors.length > 0 && <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{errors.slice(0, 5).map((e, i) => <p key={i}>{e}</p>)}</div>}
    </section>
    <section className="tt-panel"><h3>Danh sách dạy thay đã đăng ký · {covers.length}</h3>
      <p className="mt-2 text-sm">Đây là kế hoạch dự kiến trên máy đang dùng, không thay thế thời khóa biểu gốc, không đồng bộ lên máy khác và chưa tự động gửi thông báo. Cần duyệt theo quy trình của nhà trường trước khi thực hiện.</p>
      {covers.length ? <div className="tt-table-wrap mt-4"><table className="tt-table"><thead><tr><th>Ngày</th><th>Tiết</th><th>Lớp / môn</th><th>Thay giáo viên</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>{covers.map((c, i) => { const lesson = solution?.entries.find(e => e.id === c.entryIds[0]); return <tr key={c.date + ':' + c.entryIds.join(',')}><td>{c.date}</td><td>{lesson ? days[lesson.dayIndex] + ' · ' + c.entryIds.map(id => solution?.entries.find(e => e.id === id)?.period).join(', ') : '—'}</td><td>{lesson ? names.class(lesson.classId) + ' · ' + names.subject(lesson.subjectId) : 'Không còn tiết'}</td><td>{lesson ? names.teacher(lesson.teacherId) : '—'} → <b>{names.teacher(c.substituteTeacherId)}</b></td><td>{c.reason}</td><td><button type="button" aria-label={'Xóa dạy thay ' + (i + 1)} onClick={() => { if (window.confirm('Xóa đăng ký dạy thay này?')) setCovers(items => items.filter(item => item !== c)); }} className="rounded-lg p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={15}/></button></td></tr>; })}</tbody></table></div> : <p className="mt-4 text-sm text-slate-500">Chưa có đăng ký dạy thay. Chọn một tiết học ở trên để bắt đầu.</p>}
    </section>
  </div>;
}
