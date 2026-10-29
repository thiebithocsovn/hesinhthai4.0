import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Key, Mail, X } from 'lucide-react';
import { MAXIMUM_TEACHER_PASSWORD_LENGTH, MINIMUM_TEACHER_PASSWORD_LENGTH, validateTeacherPassword } from '../lib/teacherPassword';

interface Props {
  teacher: { id: string; name: string; email: string };
  onClose: () => void;
  onChangePassword: (password: string, confirmation: string) => Promise<void>;
  onSendResetEmail: () => Promise<void>;
}

export default function TeacherPasswordDialog({ teacher, onClose, onChangePassword, onSendResetEmail }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<'password' | 'email' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changed, setChanged] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  async function perform(action: 'password' | 'email') {
    if (inFlight.current || changed) return;
    setError('');
    setNotice('');
    if (action === 'password') {
      const validation = validateTeacherPassword(password, confirmation);
      if (validation) { setError(validation); return; }
    }
    inFlight.current = true;
    setBusy(action);
    try {
      if (action === 'password') {
        await onChangePassword(password, confirmation);
        setChanged(true);
        setNotice('Đã thay mật khẩu thành công. Giáo viên có thể đăng nhập bằng mật khẩu mới.');
      } else {
        await onSendResetEmail();
        setNotice('Đã gửi email khôi phục. Giáo viên hãy mở hộp thư, kiểm tra cả mục Thư rác, để tự đặt mật khẩu mới.');
      }
      setPassword('');
      setConfirmation('');
      setVisible(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể thực hiện thao tác. Vui lòng thử lại.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="teacher-password-title"
        className="max-h-[95dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl"
        onKeyDown={event => {
          if (event.key === 'Escape' && !inFlight.current) onClose();
          if (event.key !== 'Tab') return;
          const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
          if (!controls?.length) { event.preventDefault(); return; }
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 id="teacher-password-title" className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Key className="h-5 w-5 text-indigo-600" /> Đặt lại mật khẩu giáo viên
          </h3>
          <button type="button" onClick={onClose} disabled={!!busy} aria-label="Đóng"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form className="space-y-4 p-6" onSubmit={event => { event.preventDefault(); void perform('password'); }}>
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">{teacher.name}</p>
            <p className="break-all text-slate-600">{teacher.email}</p>
          </div>
          {!changed && <>
            <p className="text-sm leading-6 text-slate-600">Quản trị viên nhập mật khẩu mới cho giáo viên. Không cần mật khẩu cũ.</p>
            <div>
              <label htmlFor="teacher-new-password" className="mb-1 block text-sm font-medium text-slate-700">Mật khẩu mới</label>
              <div className="relative">
                <input id="teacher-new-password" type={visible ? 'text' : 'password'} autoComplete="new-password"
                  value={password} onChange={event => setPassword(event.target.value)} required disabled={!!busy}
                  minLength={MINIMUM_TEACHER_PASSWORD_LENGTH} maxLength={MAXIMUM_TEACHER_PASSWORD_LENGTH}
                  aria-describedby="teacher-password-hint" className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-12 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
                <button type="button" disabled={!!busy} onClick={() => setVisible(value => !value)}
                  aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible}
                  className="absolute right-2 top-2 text-slate-500">
                  {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p id="teacher-password-hint" className="mt-1 text-xs text-slate-500">Ít nhất 8 ký tự; nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
            </div>
            <div>
              <label htmlFor="teacher-confirm-password" className="mb-1 block text-sm font-medium text-slate-700">Nhập lại mật khẩu mới</label>
              <input id="teacher-confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password"
                value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={!!busy}
                minLength={MINIMUM_TEACHER_PASSWORD_LENGTH} maxLength={MAXIMUM_TEACHER_PASSWORD_LENGTH}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500" />
            </div>
          </>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={!!busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">{changed ? 'Đóng' : 'Hủy'}</button>
            {!changed && <button type="submit" disabled={!!busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy === 'password' ? 'Đang thay mật khẩu...' : 'Đặt mật khẩu mới'}
            </button>}
          </div>
          {!changed && <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-xs leading-5 text-slate-500">Hoặc để giáo viên tự đặt mật khẩu qua email:</p>
            <button type="button" onClick={() => void perform('email')} disabled={!!busy}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
              <Mail className="h-4 w-4" /> {busy === 'email' ? 'Đang gửi...' : 'Gửi email khôi phục'}
            </button>
          </div>}
        </form>
      </div>
    </div>
  );
}
