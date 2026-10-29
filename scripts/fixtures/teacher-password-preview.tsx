import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherPasswordDialog from '../../src/components/TeacherPasswordDialog';
import { changeTeacherPassword } from '../../src/lib/teacherPassword';
import '../../src/index.css';

// Browser-only test identities. No Firebase connection or real teacher account.
function Preview() {
  const [open, setOpen] = useState(false);
  return <main className="min-h-screen bg-slate-50 p-6">
    <h1>Kiểm thử hộp thoại mật khẩu</h1>
    <button className="rounded-lg bg-indigo-600 p-3 text-white" onClick={() => setOpen(true)}>Reset mật khẩu giáo viên kiểm thử</button>
    {open && <TeacherPasswordDialog teacher={{ id: 'qa-teacher', name: 'Giáo viên kiểm thử', email: 'teacher@example.edu' }} onClose={() => setOpen(false)}
      onChangePassword={(password, confirmation) => changeTeacherPassword({ server: window.location.origin, pageUrl: window.location.href,
        getUser: () => ({ uid: 'qa-administrator', async getIdToken() { return 'qa-only-token'; } }) },
      { teacherId: 'qa-teacher', email: 'teacher@example.edu', password, confirmation })}
      onSendResetEmail={async () => { (window as any).emailRequests = ((window as any).emailRequests || 0) + 1; }} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
