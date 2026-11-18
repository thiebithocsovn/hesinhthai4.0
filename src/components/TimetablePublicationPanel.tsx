import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { Download, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import type { TimetableScenario, TimetableSolution } from '../lib/smartTimetable';
import { auditTimetableSolution } from '../lib/smartTimetableAudit';
import { makePublicTimetable, publicTimetableHtml, type TimetablePublicationOptions } from '../lib/timetablePublication';

export const TIMETABLE_PUBLICATION_API = `${(import.meta.env.VITE_TEACHER_ADMIN_API_URL || 'https://hesinhthai4-0-thietbihocso.vercel.app').replace(/\/$/, '')}/api/timetable`;

export default function TimetablePublicationPanel({ scenario, solution, storageKey }: { scenario: TimetableScenario; solution: TimetableSolution | null; storageKey: string }) {
  const [options, setOptions] = useState<TimetablePublicationOptions>({ title: 'Thời khóa biểu', effectiveFrom: '', effectiveTo: '', notes: '', showTeacherNames: false });
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [publicationId, setPublicationId] = useState(() => { try { return localStorage.getItem(`${storageKey}:publication`) || ''; } catch { return ''; } });
  useEffect(() => { setApproved(false); }, [scenario, solution]);
  const audit = auditTimetableSolution(scenario, solution);
  const ready = Boolean(solution && audit.complete && audit.valid && audit.expectedPeriods);
  const link = publicationId ? `${window.location.origin}${import.meta.env.BASE_URL}?tkb=${encodeURIComponent(publicationId)}` : '';
  const publish = async (revoke = false) => {
    if (!auth.currentUser) { setMessage('Đăng nhập tài khoản giáo viên đã được duyệt để công bố trực tuyến. Có thể tải trang HTML tra cứu ngay trên thiết bị.'); return; }
    setBusy(true); setMessage('');
    try {
      const token = await auth.currentUser.getIdToken();
      const payloadScenario = { ...scenario };
      delete payloadScenario.examRoomPlan;
      delete (payloadScenario as unknown as Record<string, unknown>).publicationSnapshots;
      const response = await fetch(TIMETABLE_PUBLICATION_API + (publicationId ? `?publicationId=${encodeURIComponent(publicationId)}` : ''), {
        method: revoke ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(revoke ? {} : { body: JSON.stringify({ scenario: payloadScenario, solution, options }) }), signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Không thể công bố lịch.');
      if (revoke) {
        setPublicationId(''); try { localStorage.removeItem(`${storageKey}:publication`); } catch { /* live result remains visible */ }
        setMessage('Đã thu hồi liên kết. Người xem không thể tải lại bản công bố này. Các tệp đã tải xuống trước đó vẫn do người nhận giữ.');
      } else {
        setPublicationId(result.publicationId); try { localStorage.setItem(`${storageKey}:publication`, result.publicationId); } catch { /* link remains visible */ }
        setMessage('Đã công bố bản chụp được kiểm tra. Thay đổi dữ liệu làm việc không tự thay đổi bản công bố; bấm cập nhật khi muốn áp dụng.');
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể kết nối dịch vụ công bố.'); }
    finally { setBusy(false); }
  };
  const exportPage = () => {
    try {
      if (!solution) return;
      const snapshot = makePublicTimetable(scenario, solution, options), url = URL.createObjectURL(new Blob([publicTimetableHtml(snapshot)], { type: 'text/html;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Tra-cuu-thoi-khoa-bieu.html'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Đã xuất trang tra cứu độc lập. Có thể mở trên máy tính/điện thoại, gửi tệp hoặc đưa lên website của trường.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Không thể xuất trang.'); }
  };
  const field = 'mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm';
  return <section className="tt-panel"><div className="flex items-center gap-2"><Globe size={20} className="text-indigo-600" /><h3>Phát hành thời khóa biểu cho người xem</h3></div>
    <div className={`my-4 rounded-lg p-4 text-sm ${ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><ShieldCheck className="mr-2 inline h-4 w-4" />{ready ? `${audit.placedPeriods} tiết đã qua kiểm tra độc lập. Sẵn sàng xem trước và phát hành.` : 'Chưa đủ điều kiện công bố. Cần xếp đủ tiết và xử lý mọi lỗi được bộ kiểm tra độc lập phát hiện.'}</div>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold">Tên bản công bố<input className={field} value={options.title} onChange={e => { setOptions({ ...options, title: e.target.value }); setApproved(false); }} /></label><label className="text-xs font-semibold">Thông báo cho người xem<input className={field} value={options.notes} onChange={e => { setOptions({ ...options, notes: e.target.value }); setApproved(false); }} /></label><label className="text-xs font-semibold">Áp dụng từ ngày<input type="date" className={field} value={options.effectiveFrom} onChange={e => { setOptions({ ...options, effectiveFrom: e.target.value }); setApproved(false); }} /></label><label className="text-xs font-semibold">Đến ngày<input type="date" className={field} value={options.effectiveTo} onChange={e => { setOptions({ ...options, effectiveTo: e.target.value }); setApproved(false); }} /></label></div>
    <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={options.showTeacherNames} onChange={e => { setOptions({ ...options, showTeacherNames: e.target.checked }); setApproved(false); }} />Hiển thị tên giáo viên trong bản công khai</label><p className="mt-2">Bản công khai chỉ chứa tên trường, lịch lớp/môn/phòng và tên giáo viên nếu được chọn. Không bao gồm giờ bận, tài khoản, lịch sử chỉnh sửa, sĩ số hoặc danh sách học sinh.</p>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="tt-button" disabled={!ready || busy} onClick={exportPage}><Download size={15} />Xem trước / Tải trang HTML</button></div>
    <label className="mt-5 flex items-start gap-2 text-xs leading-6"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1.5" />Tôi đã xem phương án, ngày áp dụng và nội dung sẽ hiển thị; đồng ý cung cấp bản lịch này cho người có liên kết.</label>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="tt-button green" disabled={!ready || !approved || busy} onClick={() => void publish()}>{busy ? 'Đang xử lý...' : publicationId ? 'Cập nhật bản công bố' : 'Công bố và tạo liên kết'}</button>{publicationId && <button type="button" className="tt-button !text-rose-700" disabled={busy} onClick={() => { if (window.confirm('Thu hồi liên kết công khai hiện tại? Các tệp đã tải trước đó không thể thu hồi.')) void publish(true); }}>Thu hồi liên kết</button>}</div>
    {link && <div className="mt-5 rounded-lg border border-indigo-200 bg-indigo-50 p-4"><p className="mb-2 font-semibold">Liên kết tra cứu</p><a href={link} target="_blank" rel="noreferrer" className="break-all text-sm text-indigo-700 underline">{link}<ExternalLink size={12} className="ml-1 inline" /></a></div>}{message && <p role="status" className="mt-4 rounded-md bg-slate-50 p-3 !text-slate-700">{message}</p>}
  </section>;
}
