import React, { useState } from 'react';
import { BookOpen, Check, Clock3, GraduationCap, Layers3 } from 'lucide-react';
import type { TeachingAssignment, TimetableScenario } from '../lib/smartTimetable';
import { applyEducationConfiguration, createEducationConfiguration, EDUCATION_LEVELS, EDUCATION_PROFILES, educationScenarioIssues, inferEducationKind, defaultLevelTiming, type TimetableEducation } from '../lib/timetableEducation';

const input = 'mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-normal';
type Props = { scenario: TimetableScenario; onChange: (s: TimetableScenario) => void };

export default function TimetableEducationPanel({ scenario: s, onChange }: Props) {
  const [draft, setDraft] = useState<TimetableEducation>(() => s.education || createEducationConfiguration(inferEducationKind(s), s.classes.length ? [...new Set(s.classes.map(c => c.level))] : undefined));
  const [error, setError] = useState('');
  const patch = (value: Partial<TimetableEducation>) => { setDraft({ ...draft, ...value }); setError(''); };
  const apply = (reset: boolean) => {
    try {
      const next = applyEducationConfiguration(s, draft, reset);
      const issues = educationScenarioIssues(next);
      if (issues.length) { setError(issues.join(' ')); return; }
      if (reset && !window.confirm(`Tạo kịch bản trống cho ${EDUCATION_PROFILES.find(p => p.id === draft.kind)?.name}? ${s.classes.length} lớp và ${s.assignments.length} phân công hiện tại sẽ được thay. Bạn có thể Hoàn tác; nên tải bản sao lưu JSON trước.`)) return;
      onChange(next); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể áp dụng cấu hình.'); }
  };
  const profile = EDUCATION_PROFILES.find(p => p.id === draft.kind)!;
  const incompatible = [...s.classes, ...(s.grades || [])].some(c => !draft.levels.includes(c.level));
  const university = draft.levels.includes('Đại học');
  return <div className="space-y-5">
    <section className="tt-panel"><div className="flex items-center gap-3"><GraduationCap className="text-indigo-600" /><div><h3>Loại thời khóa biểu</h3><p>Chọn cấp hoặc hệ đào tạo để có biểu mẫu và khung giờ phù hợp với đơn vị.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{EDUCATION_PROFILES.map(p => <button type="button" key={p.id} aria-pressed={draft.kind === p.id} onClick={() => { setDraft(createEducationConfiguration(p.id)); setError(''); }} className={`relative rounded-xl border p-4 text-left transition ${draft.kind === p.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800">{p.levels.length > 1 ? <Layers3 size={17} /> : <BookOpen size={17} />}{p.name}{draft.kind === p.id && <Check size={17} className="ml-auto text-indigo-600" />}</div><p className="mt-2 !text-xs !leading-5">{p.description}</p>
      </button>)}</div>
      {draft.kind === 'custom' && <fieldset className="mt-5"><legend className="text-sm font-semibold">Các cấp/hệ của đơn vị</legend><div className="mt-3 flex flex-wrap gap-4">{EDUCATION_LEVELS.map(level => <label key={level} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.levels.includes(level)} onChange={e => { const levels = e.target.checked ? [...draft.levels, level] : draft.levels.filter(l => l !== level); patch({ levels, timings: levels.map(l => draft.timings.find(t => t.level === l) || defaultLevelTiming(l)) }); }} />{level}</label>)}</div></fieldset>}
    </section>
    <section className="tt-panel"><h3>Năm học và học kỳ</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-semibold">Năm học<input aria-label="Năm học" className={input} value={draft.academicYear} onChange={e => patch({ academicYear: e.target.value })} /></label>
      <label className="text-xs font-semibold">Học kỳ / đợt học<input aria-label="Học kỳ" className={input} value={draft.term} onChange={e => patch({ term: e.target.value })} /></label>
      <label className="text-xs font-semibold">Số tuần của học kỳ<input aria-label="Số tuần học kỳ" type="number" min={1} max={53} className={input} value={draft.weekCount} onChange={e => patch({ weekCount: Number(e.target.value), activeWeek: Math.min(draft.activeWeek, Number(e.target.value)) })} /></label>
      <label className="text-xs font-semibold">Tuần đang xếp<input aria-label="Tuần đang xếp" type="number" min={1} max={draft.weekCount} className={input} value={draft.activeWeek} onChange={e => patch({ activeWeek: Number(e.target.value) })} /></label>
    </div><p className="mt-3">Mỗi phương án thuộc một tuần cụ thể. Khoảng tuần và tuần chẵn/lẻ của từng phân công được khai báo ở Khối - môn - số tiết.</p></section>
    <section className="tt-panel"><h3 className="flex items-center gap-2"><Clock3 size={18} />Khung giờ riêng của từng cấp</h3><p>Giờ bắt đầu là giờ tiết đầu của mỗi buổi. Số tiết sáng, chiều, tối và ngày học được chỉnh ở Tiết học. Các giá trị gợi ý cần được nhà trường đối chiếu với kế hoạch giảng dạy.</p>
      <div className="mt-4 space-y-4">{draft.timings.map(t => <fieldset key={t.level} className="rounded-lg border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-indigo-800">{t.level}</legend><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[
        ['periodMinutes', 'Phút / tiết', 'number'], ['breakMinutes', 'Nghỉ giữa tiết (phút)', 'number'], ['morningStart', 'Bắt đầu sáng', 'time'], ['afternoonStart', 'Bắt đầu chiều', 'time'], ['eveningStart', 'Bắt đầu tối', 'time'], ['maxPeriodsPerDay', 'Tối đa tiết / lớp / ngày', 'number'],
      ].map(([key, label, type]) => <label key={key} className="text-xs font-semibold">{label}<input aria-label={`${label} ${t.level}`} className={input} type={type} min={key === 'breakMinutes' ? 0 : 1} value={t[key as keyof typeof t]} onChange={e => patch({ timings: draft.timings.map(v => v.level === t.level ? { ...v, [key]: type === 'number' ? Number(e.target.value) : e.target.value } : v) })} /></label>)}</div></fieldset>)}</div>
    </section>
    <section className="tt-panel"><h3>Áp dụng: {profile.name}</h3><p>{draft.levels.join(' · ') || 'Chưa chọn cấp'} · {draft.academicYear} · {draft.term}. Giáo viên và phòng dùng chung được kiểm tra theo khoảng giờ thực tế giữa tất cả các cấp.</p>
      {university && <p className="mt-3">Đại học: khai báo khoa, ngành/khóa, mã học phần và tín chỉ; phân công theo nhóm sinh viên và lớp học phần. Tín chỉ là thông tin chương trình, số tiết trực tiếp được nhập riêng. Các lớp học phần có chung sinh viên phải dùng chung lớp/nhóm hoặc được ghép nhóm để kiểm tra trùng.</p>}
      {incompatible && <p className="mt-3 !text-amber-800">Dữ liệu hiện tại có cấp ngoài lựa chọn này. Chọn loại liên cấp phù hợp hoặc tạo kịch bản trống sau khi sao lưu.</p>}
      {error && <p role="alert" className="mt-3 !text-rose-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" className="tt-button green" disabled={incompatible} onClick={() => apply(false)}>Áp dụng và giữ dữ liệu</button><button type="button" className="tt-button text-rose-700" onClick={() => apply(true)}>Tạo kịch bản trống theo loại đã chọn</button></div>
    </section>
  </div>;
}

export function TimetableTeachingCalendarPanel({ scenario: s, onChange }: Props) {
  if (!s.education) return null;
  const university = s.education.levels.includes('Đại học');
  const update = (id: string, patch: Partial<TeachingAssignment>) => onChange({ ...s, assignments: s.assignments.map(a => a.id === id ? { ...a, ...patch } : a) });
  return <section className="tt-panel"><h3>{university ? 'Lớp học phần và lịch học kỳ' : 'Tuần thực hiện phân công'}</h3><p>Tiết/tuần là số tiết của mỗi tuần có học. Phân công ngoài khoảng tuần hoặc khác tuần chẵn/lẻ sẽ không được đưa vào phương án của tuần đang chọn.</p>
    <div className="tt-table-wrap mt-4"><table className="tt-table"><thead><tr><th>Lớp / môn</th>{university && <><th>Mã lớp học phần</th><th>Hình thức</th></>}<th>Từ tuần</th><th>Đến tuần</th><th>Tuần học</th></tr></thead><tbody>{s.assignments.map(a => { const title = `${s.classes.find(c => c.id === a.classId)?.name} ${s.subjects.find(m => m.id === a.subjectId)?.name}`; return <tr key={a.id}><td>{title}</td>{university && <><td><input aria-label={`Mã lớp học phần ${title}`} value={a.courseSectionCode || ''} onChange={e => update(a.id, { courseSectionCode: e.target.value })} /></td><td><select aria-label={`Hình thức ${title}`} value={a.component || 'theory'} onChange={e => update(a.id, { component: e.target.value as TeachingAssignment['component'] })}><option value="theory">Lý thuyết</option><option value="practice">Thực hành / thí nghiệm</option><option value="seminar">Thảo luận</option></select></td></>}{(['startWeek', 'endWeek'] as const).map(key => <td key={key}><input aria-label={`${key === 'startWeek' ? 'Từ' : 'Đến'} tuần ${title}`} type="number" min={1} max={s.education!.weekCount} value={a[key] ?? (key === 'startWeek' ? 1 : s.education!.weekCount)} onChange={e => update(a.id, { [key]: Number(e.target.value) })} /></td>)}<td><select aria-label={`Tuần học ${title}`} value={a.weekPattern || 'all'} onChange={e => update(a.id, { weekPattern: e.target.value as TeachingAssignment['weekPattern'] })}><option value="all">Hằng tuần</option><option value="odd">Tuần lẻ</option><option value="even">Tuần chẵn</option></select></td></tr>; })}</tbody></table>{!s.assignments.length && <p className="tt-empty">Thêm phân công trước khi khai báo tuần học.</p>}</div>
  </section>;
}

export function TimetableEducationCatalogDetails({ scenario: s, onChange, kind }: Props & { kind: string }) {
  if (!s.education) return null;
  const university = s.education.levels.includes('Đại học');
  const elective = s.education.levels.some(l => l === 'THPT' || l === 'GDTX THPT');
  if (kind === 'class' && (university || elective)) return <section className="tt-panel"><h3>{university ? 'Ngành và khóa của nhóm sinh viên' : 'Tổ hợp môn lựa chọn'}</h3><p>{university ? 'Lớp ở đây đại diện cho một nhóm sinh viên có chung lịch. Một nhóm có thể học nhiều lớp học phần; dùng tách/ghép nhóm khi đăng ký học khác nhau.' : 'Tên tổ hợp để quản lý và tra cứu. Các môn, số tiết và nhóm lựa chọn được khai báo trong Phân công và Tách lớp.'}</p><div className="tt-table-wrap mt-4"><table className="tt-table"><thead><tr><th>Lớp / nhóm</th><th>Cấp</th>{university && <><th>Ngành / chương trình</th><th>Khóa</th></>}{elective && <th>Tổ hợp lựa chọn</th>}</tr></thead><tbody>{s.classes.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.level}</td>{university && (['programme', 'cohort'] as const).map(key => <td key={key}><input aria-label={`${key === 'programme' ? 'Ngành' : 'Khóa'} ${c.name}`} disabled={c.level !== 'Đại học'} value={c[key] || ''} onChange={e => onChange({ ...s, classes: s.classes.map(x => x.id === c.id ? { ...x, [key]: e.target.value } : x) })} /></td>)}{elective && <td><input aria-label={`Tổ hợp ${c.name}`} disabled={!['THPT', 'GDTX THPT'].includes(c.level)} value={c.electiveCombination || ''} onChange={e => onChange({ ...s, classes: s.classes.map(x => x.id === c.id ? { ...x, electiveCombination: e.target.value } : x) })} /></td>}</tr>)}</tbody></table></div></section>;
  if (kind === 'subject' && university) return <section className="tt-panel"><h3>Thông tin học phần</h3><p>Nhập số tiết trực tiếp ở phân công; tín chỉ không tự quy đổi thành số tiết/tuần.</p><div className="tt-table-wrap mt-4"><table className="tt-table"><thead><tr><th>Học phần</th><th>Mã học phần</th><th>Tín chỉ</th></tr></thead><tbody>{s.subjects.map(m => <tr key={m.id}><td>{m.name}</td><td><input aria-label={`Mã học phần ${m.name}`} value={m.code || ''} onChange={e => onChange({ ...s, subjects: s.subjects.map(x => x.id === m.id ? { ...x, code: e.target.value } : x) })} /></td><td><input aria-label={`Tín chỉ ${m.name}`} type="number" min={0.5} step={0.5} value={m.credits ?? ''} onChange={e => onChange({ ...s, subjects: s.subjects.map(x => x.id === m.id ? { ...x, credits: e.target.value ? Number(e.target.value) : undefined } : x) })} /></td></tr>)}</tbody></table></div></section>;
  return null;
}
