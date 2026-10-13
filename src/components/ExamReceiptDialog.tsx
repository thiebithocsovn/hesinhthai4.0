import { useState } from 'react';
import { Printer, X } from 'lucide-react';
import { printExamReceipt } from '../lib/examReceipt';

export default function ExamReceiptDialog({ html, onClose }: { html: string; onClose: () => void }) {
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState(false);
  return <div className="fixed inset-0 z-[80] flex flex-col bg-slate-900/70 p-2 sm:p-5" role="dialog" aria-modal="true" aria-label="Phiếu xác nhận nộp bài">
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div><h2 className="font-bold">Phiếu xác nhận nộp bài</h2><p className="text-xs text-slate-500">Giấy A4 dọc · Chọn máy in, in phiếu rồi ký xác nhận.</p>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div>
        <div className="flex gap-2"><button type="button" disabled={printing} onClick={async () => { setPrinting(true); setError(''); try { await printExamReceipt(html); } catch (error) { setError(error instanceof Error ? error.message : 'Chưa thể mở lệnh in. Hãy thử lại.'); } finally { setPrinting(false); } }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"><Printer size={18} />{printing ? 'Đang mở…' : 'In phiếu'}</button><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Đóng phiếu"><X /></button></div>
      </div>
      <iframe title="Xem trước phiếu ký A4" srcDoc={html} sandbox="allow-same-origin" className="min-h-0 w-full flex-1 border-0" />
    </div>
  </div>;
}
