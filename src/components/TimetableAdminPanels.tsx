import React, { useState } from 'react';
import { BookOpen, CalendarDays, CheckCircle2, ChevronRight, Database, Download, FileDown, FileUp, GraduationCap, Plus, Search, Trash2, Upload, Users, WandSparkles } from 'lucide-react';
import { activeTimetableDays, parseTimetableSlot, timetableSlotKey, type SchoolLevel, type TimetableScenario, type TimetableSolution, type TeachingAssignment } from '../lib/smartTimetable';
import { timetableEntityId } from '../lib/smartTimetableImport';
import { classGradeId, setHomeroomTeacher, timetableGrades } from '../lib/timetableAdmin';

interface ScenarioProps { scenario: TimetableScenario; onChange: (next: TimetableScenario) => void }
const inputClass = 'rounded-md border border-slate-200 bg-white px-3 py-2 text-sm';

export function TimetableCatalogPanel({ scenario, kind, onChange }: ScenarioProps & { kind: 'teacher' | 'class' | 'subject' | 'room' }) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<SchoolLevel>('THCS');
  const [gradeId, setGradeId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const key = kind === 'teacher' ? 'teachers' : kind === 'class' ? 'classes' : kind === 'subject' ? 'subjects' : 'rooms';
  const items = scenario[key];
  const grades = timetableGrades(scenario);
  const names = { teacher: 'giáo viên', class: 'lớp', subject: 'môn học', room: 'phòng' };
  const update = (id: string, patch: Record<string, unknown>) => {
    if (typeof patch.name === 'string' && (!patch.name.trim() || items.some(item => item.id !== id && item.name.toLocaleLowerCase('vi') === String(patch.name).trim().toLocaleLowerCase('vi')))) { setError('Tên trống hoặc đã tồn tại.'); return; }
    onChange({ ...scenario, [key]: items.map(item => item.id === id ? { ...item, ...patch } : item) });
    setError('');
  };
  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const labels = name.split(/[,;\n]/).map(item => item.trim()).filter(Boolean);
    if (!labels.length) return;
    const allNames = [...items.map(item => item.name.toLocaleLowerCase('vi')), ...labels.map(item => item.toLocaleLowerCase('vi'))];
    if (new Set(allNames).size !== allNames.length) { setError('Tên đã tồn tại. Mỗi tên cần khác nhau.'); return; }
    const selectedGrade = grades.find(grade => grade.id === gradeId);
    const added = labels.map(label => ({ id: timetableEntityId(kind, label), name: label,
      ...(kind === 'teacher' ? { level, maxPeriodsPerDay: 6, maxConsecutivePeriods: 4 } : {}),
      ...(kind === 'class' ? { level: selectedGrade?.level || (level === 'Tiểu học' ? 'Tiểu học' : 'THCS'), maxPeriodsPerDay: scenario.periodsPerDay, ...(selectedGrade ? { gradeId: selectedGrade.id } : {}) } : {}),
    }));
    onChange({ ...scenario, [key]: [...items, ...added] });
    setName(''); setError('');
  };
  const remove = (id: string) => {
    const used = scenario.assignments.some(item => kind === 'teacher' ? item.teacherId === id : kind === 'class' ? item.classId === id : kind === 'subject' ? item.subjectId === id : item.roomId === id);
    if (used) { setError(`Đang có phân công sử dụng ${names[kind]} này. Hãy sửa hoặc xóa phân công liên quan trước.`); return; }
    const next = { ...scenario, [key]: items.filter(item => item.id !== id) };
    if (kind === 'class') next.teachers = next.teachers.map(item => item.homeroomClassId === id ? { ...item, homeroomClassId: undefined } : item);
    if (kind === 'teacher') next.classes = next.classes.map(item => item.homeroomTeacherId === id ? { ...item, homeroomTeacherId: undefined } : item);
    onChange(next);
  };
  return <div className="space-y-4">
    <form onSubmit={add} className="tt-panel"><div className="tt-toolbar !mb-0"><input aria-label={`Tên ${names[kind]} mới`} value={name} onChange={event => setName(event.target.value)} className={`${inputClass} min-w-40 flex-1`} placeholder={`Nhập tên ${names[kind]}, ngăn cách bằng dấu phẩy để thêm nhiều...`} required />
      {(kind === 'class' || kind === 'teacher') && <select aria-label="Cấp học" value={level} onChange={event => setLevel(event.target.value as SchoolLevel)} className={inputClass}><option>Tiểu học</option><option>THCS</option>{kind === 'teacher' && <option>Liên cấp</option>}</select>}
      {kind === 'class' && <select aria-label="Khối của lớp mới" value={gradeId} onChange={event => setGradeId(event.target.value)} className={inputClass}><option value="">Tự nhận từ tên lớp</option>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name} · {grade.level}</option>)}</select>}
      <button type="submit" className="tt-button green"><Plus size={15} />Thêm {names[kind]}</button></div></form>
    {error && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    <div className="flex items-center gap-2 text-slate-500"><Search size={15} /><input aria-label="Tìm trong danh mục" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm trong danh sách..." className={`${inputClass} flex-1`} /><span className="tt-badge">{items.length} bản ghi</span></div>
    <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>STT</th><th>Tên {names[kind]}</th>{(kind === 'class' || kind === 'teacher') && <th>Cấp học</th>}{kind === 'class' && <th>Khối</th>}{kind === 'subject' && <><th>Ưu tiên sáng</th><th>Tránh tiết cuối</th></>}<th>Thao tác</th></tr></thead><tbody>{items.filter(item => item.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).map((item, index) => <tr key={item.id}><td className="text-slate-400">{index + 1}</td><td><input aria-label={`Tên ${item.name}`} key={`${item.id}-${item.name}`} defaultValue={item.name} onBlur={event => { if (event.target.value !== item.name) { const value = event.target.value.trim(); update(item.id, { name: value }); if (!value || items.some(other => other.id !== item.id && other.name.toLocaleLowerCase('vi') === value.toLocaleLowerCase('vi'))) event.target.value = item.name; } }} /></td>
      {(kind === 'class' || kind === 'teacher') && <td><select aria-label={`Cấp học ${item.name}`} value={('level' in item ? item.level : 'THCS') as string} onChange={event => update(item.id, { level: event.target.value, ...(kind === 'class' ? { gradeId: undefined } : {}) })}><option>Tiểu học</option><option>THCS</option>{kind === 'teacher' && <option>Liên cấp</option>}</select></td>}
      {kind === 'class' && <td><select aria-label={`Khối ${item.name}`} value={classGradeId(item as TimetableScenario['classes'][number])} onChange={event => { const grade = grades.find(value => value.id === event.target.value); if (grade) update(item.id, { gradeId: grade.id, level: grade.level }); }}>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name} · {grade.level}</option>)}</select></td>}
      {kind === 'subject' && <><td><input type="checkbox" aria-label={`Ưu tiên sáng ${item.name}`} checked={Boolean('preferMorning' in item && item.preferMorning)} onChange={event => update(item.id, { preferMorning: event.target.checked })} /></td><td><input type="checkbox" aria-label={`Tránh tiết cuối ${item.name}`} checked={Boolean('avoidLastPeriod' in item && item.avoidLastPeriod)} onChange={event => update(item.id, { avoidLastPeriod: event.target.checked })} /></td></>}
      <td><button type="button" className="p-2 text-rose-500" aria-label={`Xóa ${item.name}`} onClick={() => remove(item.id)}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{!items.length && <div className="tt-empty">Chưa có {names[kind]}. Thêm dữ liệu bằng biểu mẫu phía trên.</div>}</div>
  </div>;
}

export function TimetableGradesPanel({ scenario, onChange }: ScenarioProps) {
  const grades = timetableGrades(scenario);
  const [name, setName] = useState('');
  const [level, setLevel] = useState<'Tiểu học' | 'THCS'>('THCS');
  const [error, setError] = useState('');
  return <div className="space-y-4"><form className="tt-panel tt-toolbar" onSubmit={event => {
    event.preventDefault();
    if (!name.trim() || grades.some(item => item.name.toLocaleLowerCase('vi') === name.trim().toLocaleLowerCase('vi') && item.level === level)) { setError('Tên khối trống hoặc đã tồn tại trong cấp học.'); return; }
    onChange({ ...scenario, grades: [...grades, { id: timetableEntityId('khoi', `${level}-${name.trim()}`), name: name.trim(), level }] }); setName(''); setError('');
  }}><input className={`${inputClass} flex-1`} aria-label="Tên khối mới" placeholder="Ví dụ: Khối 8" value={name} onChange={event => setName(event.target.value)} required /><select className={inputClass} aria-label="Cấp học của khối" value={level} onChange={event => setLevel(event.target.value as typeof level)}><option>Tiểu học</option><option>THCS</option></select><button type="submit" className="tt-button green"><Plus size={15} />Thêm khối</button></form>
    {error && <p role="alert" className="text-sm text-amber-700">{error}</p>}
    <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>STT</th><th>Khối / Khoa</th><th>Cấp học</th><th>Lớp trực thuộc</th><th>Thao tác</th></tr></thead><tbody>{grades.map((grade, index) => {
      const classes = scenario.classes.filter(item => classGradeId(item) === grade.id);
      return <tr key={grade.id}><td>{index + 1}</td><td><input aria-label={`Tên ${grade.name}`} key={`${grade.id}-${grade.name}`} defaultValue={grade.name} onBlur={event => { const value = event.target.value.trim(); if (value && !grades.some(other => other.id !== grade.id && other.name.toLowerCase() === value.toLowerCase() && other.level === grade.level)) { if (value !== grade.name) onChange({ ...scenario, grades: grades.map(item => item.id === grade.id ? { ...item, name: value } : item) }); } else { event.target.value = grade.name; setError('Tên khối trống hoặc đã tồn tại.'); } }} /></td><td>{grade.level}</td><td>{classes.map(item => item.name).join(', ') || 'Chưa có lớp'}</td><td><button type="button" aria-label={`Xóa ${grade.name}`} className="p-2 text-rose-500" onClick={() => { if (classes.length) { setError('Hãy chuyển các lớp sang khối khác trước khi xóa khối này.'); return; } onChange({ ...scenario, grades: grades.filter(item => item.id !== grade.id) }); }}><Trash2 size={15} /></button></td></tr>;
    })}</tbody></table>{!grades.length && <div className="tt-empty">Chưa có khối. Thêm khối để bắt đầu khai báo.</div>}</div>
  </div>;
}

export function TimetableHomeroomPanel({ scenario, onChange }: ScenarioProps) {
  return <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Lớp</th><th>Cấp học</th><th>Giáo viên chủ nhiệm</th><th>Số tiết phân công</th></tr></thead><tbody>{scenario.classes.map(classroom => <tr key={classroom.id}><td><b>{classroom.name}</b></td><td>{classroom.level}</td><td><select aria-label={`GVCN ${classroom.name}`} value={classroom.homeroomTeacherId || ''} onChange={event => onChange(setHomeroomTeacher(scenario, classroom.id, event.target.value))}><option value="">Chưa phân công</option>{scenario.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></td><td>{scenario.assignments.filter(item => item.classId === classroom.id).reduce((sum, item) => sum + item.periodsPerWeek, 0)} tiết/tuần</td></tr>)}</tbody></table>{!scenario.classes.length && <div className="tt-empty">Khai báo lớp học và giáo viên trước khi phân công chủ nhiệm.</div>}<p className="px-4 py-3 text-xs text-slate-500">Mỗi giáo viên chủ nhiệm một lớp. Chọn lớp mới sẽ gỡ phân công chủ nhiệm trước đó.</p></div>;
}

export function TimetableCurriculumPanel({ scenario, onChange }: ScenarioProps) {
  const [classId, setClassId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const grades = timetableGrades(scenario);
  const days = activeTimetableDays(scenario);
  const assignments = scenario.assignments.filter(item => (!classId || item.classId === classId) && (!gradeId || classGradeId(scenario.classes.find(classroom => classroom.id === item.classId)!) === gradeId));
  const update = (id: string, patch: Partial<TeachingAssignment>) => onChange({ ...scenario, assignments: scenario.assignments.map(item => item.id === id ? { ...item, ...patch } : item) });
  return <div className="space-y-4"><div className="tt-toolbar"><select className={inputClass} aria-label="Lọc theo khối" value={gradeId} onChange={event => { setGradeId(event.target.value); setClassId(''); }}><option value="">Tất cả khối</option>{grades.map(grade => <option key={grade.id} value={grade.id}>{grade.name} · {grade.level}</option>)}</select><select className={inputClass} aria-label="Lọc phân công theo lớp" value={classId} onChange={event => setClassId(event.target.value)}><option value="">Tất cả lớp</option>{scenario.classes.filter(item => !gradeId || classGradeId(item) === gradeId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="tt-badge">{assignments.length} phân công · {assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0)} tiết/tuần</span></div>
    <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Lớp</th><th>Môn</th><th>Giáo viên</th><th>Tiết/tuần</th><th>Tối đa/ngày</th><th>Tiết liền</th><th>Buổi</th><th>Phòng</th><th>Bắt đầu cố định</th></tr></thead><tbody>{assignments.map(item => {
      const title = `${scenario.classes.find(value => value.id === item.classId)?.name} ${scenario.subjects.find(value => value.id === item.subjectId)?.name}`;
      const fixed = item.fixedStartSlots?.[0] || '';
      return <tr key={item.id}><td><b>{scenario.classes.find(value => value.id === item.classId)?.name}</b></td><td>{scenario.subjects.find(value => value.id === item.subjectId)?.name}</td><td><select aria-label={`Giáo viên ${title}`} value={item.teacherId} onChange={event => update(item.id, { teacherId: event.target.value })}>{scenario.teachers.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></td>
        <td><input aria-label={`Số tiết ${title}`} type="number" min={1} max={60} value={item.periodsPerWeek} onChange={event => update(item.id, { periodsPerWeek: Math.max(1, Math.min(60, Number(event.target.value))) })} /></td><td><input aria-label={`Tối đa mỗi ngày ${title}`} type="number" min={item.blockSize || 1} max={scenario.periodsPerDay} value={item.maxPerDay || 1} onChange={event => update(item.id, { maxPerDay: Math.max(item.blockSize || 1, Math.min(scenario.periodsPerDay, Number(event.target.value))) })} /></td>
        <td><select aria-label={`Tiết liền ${title}`} value={item.blockSize || 1} onChange={event => update(item.id, { blockSize: Number(event.target.value) as 1 | 2 | 3, maxPerDay: Math.max(Number(event.target.value), item.maxPerDay || 1) })}>{[1, 2, 3].map(size => <option key={size} value={size}>{size} tiết</option>)}</select></td>
        <td><select aria-label={`Buổi học ${title}`} value={item.session || 'any'} onChange={event => update(item.id, { session: event.target.value as TeachingAssignment['session'] })}><option value="any">Bất kỳ</option><option value="morning">Sáng</option><option value="afternoon">Chiều</option></select></td>
        <td><select aria-label={`Phòng ${title}`} value={item.roomId || ''} onChange={event => update(item.id, { roomId: event.target.value || undefined })}><option value="">Phòng thường</option>{scenario.rooms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></td>
        <td><select aria-label={`Tiết cố định ${title}`} value={fixed} onChange={event => update(item.id, { fixedStartSlots: event.target.value ? [event.target.value, ...(item.fixedStartSlots || []).slice(1)] : [] })}><option value="">Không cố định</option>{days.flatMap((day, dayIndex) => Array.from({ length: scenario.periodsPerDay }, (_, period) => <option key={`${dayIndex}:${period + 1}`} value={timetableSlotKey(dayIndex, period + 1)}>{day} · tiết {period + 1}</option>))}</select>{(item.fixedStartSlots || []).length > 1 && <p className="mt-1 text-xs text-slate-500">+ {item.fixedStartSlots!.slice(1).map(slot => { const parsed = parseTimetableSlot(slot); return parsed ? `${days[parsed.dayIndex]} tiết ${parsed.period}` : slot; }).join(', ')}</p>}</td>
      </tr>;
    })}</tbody></table>{!assignments.length && <div className="tt-empty">Chưa có phân công phù hợp. Thêm ở mục Phân công giảng dạy hoặc nhập từ Excel.</div>}</div>
    <p className="text-xs leading-6 text-slate-500">Mỗi dòng là một phân công thực tế. Thay đổi số tiết, buổi hoặc phòng sẽ yêu cầu xếp lại lịch. Số tiết có thể khác nhau giữa các lớp cùng khối.</p>
  </div>;
}

export function TimetableSettingsPanel({ scenario, onChange, pageId }: ScenarioProps & { pageId: string }) {
  if (pageId === 'limits') return <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>Giáo viên</th><th>Cấp</th><th>Tối đa tiết/ngày</th><th>Tối đa tiết liên tục</th><th>Tải hiện tại</th></tr></thead><tbody>{scenario.teachers.map(teacher => <tr key={teacher.id}><td><b>{teacher.name}</b></td><td>{teacher.level}</td>{(['maxPeriodsPerDay', 'maxConsecutivePeriods'] as const).map(key => <td key={key}><input aria-label={`${key === 'maxPeriodsPerDay' ? 'Tối đa ngày' : 'Tối đa liên tục'} ${teacher.name}`} type="number" min={1} max={scenario.periodsPerDay} value={teacher[key] || scenario.periodsPerDay} onChange={event => onChange({ ...scenario, teachers: scenario.teachers.map(item => item.id === teacher.id ? { ...item, [key]: Math.max(1, Math.min(scenario.periodsPerDay, Number(event.target.value))) } : item) })} /></td>)}<td>{scenario.assignments.filter(item => item.teacherId === teacher.id).reduce((sum, item) => sum + item.periodsPerWeek, 0)} tiết/tuần</td></tr>)}</tbody></table></div>;
  return <section className="tt-panel"><h3>Khung học toàn trường</h3><p>Khung giờ này áp dụng cho mọi lớp. Đặt giờ nghỉ riêng cho giáo viên, lớp hoặc phòng tại mục Tiết nghỉ / giờ bận.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Tên trường<input aria-label="Tên trường" className={`${inputClass} mt-2 w-full`} value={scenario.name} onChange={event => onChange({ ...scenario, name: event.target.value })} /></label>
    <label className="text-xs font-semibold text-slate-600">Ngày học mỗi tuần<select aria-label="Ngày học mỗi tuần" className={`${inputClass} mt-2 w-full`} value={scenario.daysPerWeek || 5} onChange={event => onChange({ ...scenario, daysPerWeek: Number(event.target.value) as 5 | 6 })}><option value={5}>5 ngày · Thứ Hai – Thứ Sáu</option><option value={6}>6 ngày · Thứ Hai – Thứ Bảy</option></select></label>
    <label className="text-xs font-semibold text-slate-600">Số tiết mỗi ngày<input aria-label="Số tiết mỗi ngày" className={`${inputClass} mt-2 w-full`} type="number" min={1} max={12} value={scenario.periodsPerDay} onChange={event => { const value = Math.max(1, Math.min(12, Number(event.target.value))); onChange({ ...scenario, periodsPerDay: value, morningPeriods: Math.min(scenario.morningPeriods || 5, value) }); }} /></label>
    <label className="text-xs font-semibold text-slate-600">Số tiết buổi sáng<input aria-label="Số tiết buổi sáng" className={`${inputClass} mt-2 w-full`} type="number" min={1} max={scenario.periodsPerDay} value={scenario.morningPeriods || 5} onChange={event => onChange({ ...scenario, morningPeriods: Math.max(1, Math.min(scenario.periodsPerDay, Number(event.target.value))) })} /></label>
    <div className="rounded-md bg-indigo-50 p-3 text-sm text-indigo-800 sm:col-span-2 lg:col-span-3">Sáng: tiết 1–{scenario.morningPeriods || 5} · Chiều: {scenario.periodsPerDay > (scenario.morningPeriods || 5) ? `tiết ${(scenario.morningPeriods || 5) + 1}–${scenario.periodsPerDay}` : 'không bố trí'}<p className="mt-1">Tiết đôi và tiết ba được giữ trong cùng một buổi.</p></div>
  </div><div className="mt-6 tt-table-wrap"><table className="tt-table"><thead><tr><th>Tiết</th>{activeTimetableDays(scenario).map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{Array.from({ length: scenario.periodsPerDay }, (_, i) => <tr key={i}><td>Tiết {i + 1}</td>{activeTimetableDays(scenario).map(day => <td key={day}><span className="tt-badge">{i < (scenario.morningPeriods || 5) ? 'Sáng' : 'Chiều'}</span></td>)}</tr>)}</tbody></table></div></section>;
}

export function TimetableAvailabilityPanel({ scenario, onChange, kind, onKind }: ScenarioProps & { kind: 'teacher' | 'class' | 'room'; onKind: (kind: 'teacher' | 'class' | 'room') => void }) {
  const key = kind === 'teacher' ? 'teachers' : kind === 'class' ? 'classes' : 'rooms';
  const resources = scenario[key];
  const [id, setId] = useState(resources[0]?.id || '');
  const selected = resources.find(item => item.id === id) || resources[0];
  const days = activeTimetableDays(scenario);
  const slots = selected?.unavailableSlots || [];
  const update = (next: string[]) => { if (selected) onChange({ ...scenario, [key]: resources.map(item => item.id === selected.id ? { ...item, unavailableSlots: next } : item) }); };
  const sessionSlots = (morning: boolean) => days.flatMap((_, day) => Array.from({ length: scenario.periodsPerDay }, (_, i) => i + 1).filter(period => morning ? period <= (scenario.morningPeriods || 5) : period > (scenario.morningPeriods || 5)).map(period => timetableSlotKey(day, period)));
  return <div className="space-y-4"><div className="tt-panel"><div className="tt-toolbar"><select aria-label="Loại đối tượng khóa giờ" className={inputClass} value={kind} onChange={event => onKind(event.target.value as typeof kind)}><option value="teacher">Giáo viên</option><option value="class">Lớp học</option><option value="room">Phòng học</option></select><select aria-label="Đối tượng khóa giờ" className={inputClass} value={selected?.id || ''} onChange={event => setId(event.target.value)}>{resources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="tt-badge">{slots.length} ô đã khóa</span></div><p>Bấm ô để đổi trạng thái. Ô đỏ là thời gian không được xếp. Tất cả thay đổi là ràng buộc cứng.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="tt-button" disabled={!selected} onClick={() => update([...new Set([...slots, ...sessionSlots(true)])])}>Khóa toàn bộ buổi sáng</button><button type="button" className="tt-button" disabled={!selected} onClick={() => update([...new Set([...slots, ...sessionSlots(false)])])}>Khóa toàn bộ buổi chiều</button><button type="button" className="tt-button" disabled={!slots.length} onClick={() => update([])}>Mở toàn bộ giờ của đối tượng</button></div></div>
    {selected ? <div className="tt-table-wrap"><table className="tt-table"><thead><tr><th>{selected.name}</th>{days.map(day => <th key={day}>{day}</th>)}</tr></thead><tbody>{Array.from({ length: scenario.periodsPerDay }, (_, i) => i + 1).map(period => <tr key={period}><td>Tiết {period} · {period <= (scenario.morningPeriods || 5) ? 'Sáng' : 'Chiều'}</td>{days.map((day, dayIndex) => { const slot = timetableSlotKey(dayIndex, period); const blocked = slots.includes(slot); return <td key={day}><button type="button" aria-label={`${selected.name} ${day} tiết ${period}`} aria-pressed={blocked} onClick={() => update(blocked ? slots.filter(value => value !== slot) : [...slots, slot])} className={`w-full rounded-md px-4 py-2 text-xs ${blocked ? 'bg-rose-100 font-bold text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{blocked ? 'Đã khóa' : 'Có thể xếp'}</button></td>; })}</tr>)}</tbody></table></div> : <div className="tt-empty">Chưa có đối tượng. Khai báo danh mục trước khi đặt giờ bận.</div>}
  </div>;
}

export function TimetableOverviewPanel({ scenario, solution, navigate, onImport, onTemplate }: { scenario: TimetableScenario; solution: TimetableSolution | null; navigate: (id: string) => void; onImport: () => void; onTemplate: () => void }) {
  const summaries = [
    { label: 'Khối', value: timetableGrades(scenario).length, icon: GraduationCap, page: 'grades' },
    { label: 'Lớp học', value: scenario.classes.length, icon: Users, page: 'classes' },
    { label: 'Tiết / tuần', value: scenario.assignments.reduce((sum, item) => sum + item.periodsPerWeek, 0), icon: CalendarDays, page: 'curriculum' },
    { label: 'Môn học', value: scenario.subjects.length, icon: BookOpen, page: 'subjects' },
    { label: 'Giáo viên', value: scenario.teachers.length, icon: Users, page: 'teachers' },
  ];
  const guides = [
    { title: 'Khai báo dữ liệu', text: 'Khối, lớp, tiết học, môn và giáo viên trong cùng một không gian.', page: 'grades', icon: GraduationCap },
    { title: 'Phân công chuyên môn', text: 'Gán giáo viên, môn học và số tiết theo từng lớp; hỗ trợ nhập Excel.', page: 'assignments', icon: Users },
    { title: 'Xếp lịch tự động', text: 'Xếp toàn trường với giờ bận, phòng dùng chung và tiết cố định.', page: 'schedule', icon: WandSparkles },
    { title: 'Tinh chỉnh thời khóa biểu', text: 'Di chuyển tiết, khóa block tốt và chạy tối ưu lại khi cần.', page: 'refine', icon: CalendarDays },
    { title: 'Kiểm tra độc lập', text: 'Đối chiếu số tiết và kiểm tra trùng lớp, giáo viên, phòng học.', page: 'publication', icon: CheckCircle2 },
    { title: 'Xuất file và sao lưu', text: 'Xuất Excel, in PDF và sao lưu toàn bộ dữ liệu để khôi phục.', page: 'backup', icon: Database },
  ];
  return <div className="space-y-5"><div className="tt-summary">{summaries.map(item => <button type="button" key={item.page} onClick={() => navigate(item.page)}><item.icon /><div><b>{item.value}</b><span>{item.label}</span></div></button>)}</div>
    <div className="tt-panel flex flex-wrap items-center justify-between gap-4"><div><h3>Bắt đầu bằng phân công chuyên môn</h3><p>Tải mẫu rồi nhập Excel để tạo danh mục và phân công trong một lần.</p></div><div className="flex gap-2"><button type="button" className="tt-button" onClick={onTemplate}><FileDown size={15} />Tải mẫu</button><button type="button" className="tt-button green" onClick={onImport}><Upload size={15} />Nhập Excel</button></div></div>
    {solution && <button type="button" className="tt-panel w-full text-left" onClick={() => navigate('schedule')}><h3>Phương án hiện tại: {solution.entries.length} tiết đã xếp</h3><p>{solution.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0)} tiết chưa xếp · {solution.diagnostics.hardConflicts.length} xung đột được ghi nhận · Mở thời khóa biểu để xem chi tiết.</p></button>}
    <div className="tt-guide-grid">{guides.map((guide, index) => <article className="tt-guide-card" key={guide.page}><div className="tt-guide-cover"><guide.icon size={33} strokeWidth={1.5} /><span>0{index + 1}</span></div><div className="tt-guide-body"><h3>{guide.title}</h3><p>{guide.text}</p><button type="button" className="tt-button" onClick={() => navigate(guide.page)}>Mở chức năng<ChevronRight size={13} /></button></div></article>)}</div>
  </div>;
}

export function TimetableBackupPanel({ solution, versions, onBackup, onRestore, onExcel, onImport, onTemplate, onVersion, onReset }: { solution: TimetableSolution | null; versions: TimetableSolution[]; onBackup: () => void; onRestore: () => void; onExcel: () => void; onImport: () => void; onTemplate: () => void; onVersion: (value: TimetableSolution) => void; onReset: () => void }) {
  return <div className="space-y-5"><section className="tt-panel"><h3>Dữ liệu và thời khóa biểu</h3><p>Sao lưu JSON giữ danh mục, phân công, ràng buộc và các phương án. Excel chứa bảng tổng hợp và lịch lớp, giáo viên.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="tt-button green" onClick={onBackup}><Database size={15} />Sao lưu JSON</button><button type="button" className="tt-button" onClick={onRestore}><FileUp size={15} />Khôi phục JSON</button><button type="button" className="tt-button primary" disabled={!solution} onClick={onExcel}><Download size={15} />Xuất Excel TKB</button><button type="button" className="tt-button" onClick={onTemplate}><FileDown size={15} />Tải mẫu Excel</button><button type="button" className="tt-button" onClick={onImport}><Upload size={15} />Nhập Excel phân công</button></div></section>
    <section className="tt-panel"><h3>Các phương án đã lưu</h3>{versions.length ? <div className="mt-4 flex flex-wrap gap-3">{versions.map((version, index) => <button type="button" key={`${version.generatedAt}-${index}`} className="tt-button flex-col !items-start" onClick={() => onVersion(version)}><b>Phương án {index + 1} · {version.entries.length} tiết</b><small>{new Date(version.generatedAt).toLocaleString('vi-VN')}</small><small>{version.diagnostics.unscheduled.reduce((sum, item) => sum + item.remaining, 0)} tiết chưa xếp</small></button>)}</div> : <p>Chưa có phương án. Chạy Xếp tự động để tạo lịch.</p>}</section>
    <section className="tt-panel"><h3>Dữ liệu mẫu liên cấp</h3><p>Thay bộ dữ liệu hiện tại bằng mẫu để trải nghiệm. Hãy sao lưu JSON trước khi dùng.</p><button type="button" className="tt-button mt-4 text-rose-700" onClick={onReset}>Khôi phục dữ liệu mẫu</button></section>
  </div>;
}

const advancedMessages: Record<string, { title: string; detail: string; action: string; page: string }> = {
  campuses: { title: 'Chưa hỗ trợ nhiều cơ sở và thời gian di chuyển', detail: 'Hiện tại các lớp dùng chung một khung giờ của trường. Có thể khai báo phòng và giờ bận; chưa có ràng buộc di chuyển giữa các cơ sở.', action: 'Quản lý phòng học', page: 'rooms' },
  'same-session': { title: 'Chưa hỗ trợ nhóm nhiều môn bắt buộc cùng buổi', detail: 'Có thể đặt từng phân công chỉ học sáng hoặc chiều và khai báo tiết đôi/ba. Chưa có ràng buộc buộc nhiều môn khác nhau cùng một buổi trong cùng ngày.', action: 'Cấu hình buổi cho phân công', page: 'class-session' },
  concurrency: { title: 'Chưa hỗ trợ giới hạn đồng thời theo môn', detail: 'Bộ xếp lịch kiểm tra trùng phòng. Với môn cần một phòng chuyên biệt, gán cùng phòng cho các phân công để tránh trùng tài nguyên; giới hạn nhiều lớp đồng thời theo môn chưa được hỗ trợ.', action: 'Gán phòng cho phân công', page: 'curriculum' },
  merge: { title: 'Chưa hỗ trợ ghép nhiều lớp học đồng thời', detail: 'Mỗi phân công hiện thuộc một lớp. Không thể dùng cùng giáo viên dạy nhiều lớp ở cùng tiết bằng cách ghép nhóm; thao tác đó sẽ bị phát hiện là trùng lịch.', action: 'Xem phân công hiện có', page: 'assignments' },
  split: { title: 'Chưa hỗ trợ tách nhóm học song song', detail: 'Hiện tại một lớp chỉ có một tiết tại mỗi thời điểm. Chưa thể chia cùng lớp thành nhiều nhóm học các môn khác nhau đồng thời.', action: 'Xem danh mục lớp', page: 'classes' },
  'public-links': { title: 'Chưa có liên kết công khai thời khóa biểu', detail: 'Dữ liệu thời khóa biểu được lưu theo tài khoản và trên thiết bị. Thầy cô có thể kiểm tra rồi chia sẻ file Excel hoặc PDF; bản này chưa tạo trang tra cứu công khai cho học sinh.', action: 'Kiểm tra trước khi chia sẻ', page: 'publication' },
  'exam-rooms': { title: 'Chia phòng thi thuộc nghiệp vụ kỳ thi', detail: 'Màn hình này quản lý phòng trong phân công giảng dạy và lịch sử dụng phòng. Việc chia học sinh vào phòng thi chưa có trong bộ xếp thời khóa biểu.', action: 'Xem lịch phòng giảng dạy', page: 'room-schedule' },
};

export function TimetableAdvancedPanel({ pageId, navigate }: { pageId: string; navigate: (id: string) => void }) {
  const info = advancedMessages[pageId] || advancedMessages.campuses;
  return <section className="tt-panel"><div className="tt-capability-note"><b>{info.title}</b><p className="!text-amber-800 mt-2">{info.detail}</p></div><button type="button" className="tt-button mt-5" onClick={() => navigate(info.page)}>{info.action}<ChevronRight size={14} /></button></section>;
}
