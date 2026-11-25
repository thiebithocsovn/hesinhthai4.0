import React from 'react';
import { ArrowRight, BookOpen, Brain, CalendarRange, CheckCircle2, ClipboardCheck, FileSpreadsheet, GraduationCap, Layers, Monitor, ShieldCheck, Sparkles, Users } from 'lucide-react';

interface Props {
  onTeacherLogin: () => void;
  onTeacherRegister: () => void;
  onStudentLogin: () => void;
  children?: React.ReactNode;
  authMode?: 'login' | 'register';
}
const benefits = [
  { Icon: Brain, title: 'AI hỗ trợ giáo viên', desc: 'Trợ lý soạn giáo án, học liệu, câu hỏi và kế hoạch giáo dục. Giáo viên kiểm tra trước khi sử dụng.' },
  { Icon: ClipboardCheck, title: 'Kiểm tra và đánh giá', desc: 'Ngân hàng câu hỏi, kỳ thi trực tuyến, Plicker và Tường học tập AI.' },
  { Icon: CalendarRange, title: 'Quản lý công việc', desc: 'Thời khóa biểu, EduKPI và các công cụ tổ chức hoạt động lớp học.' },
  { Icon: FileSpreadsheet, title: 'Xử lý học liệu', desc: 'Công cụ Excel, PDF, hoạt động tương tác và không gian làm việc cá nhân.' },
];
const plans = [
  { title: 'Cơ bản', audience: 'Giáo viên cá nhân', price: 'Miễn phí', items: ['Dùng thử các công cụ', 'Lưu dữ liệu theo tài khoản'], action: 'Đăng ký ngay' },
  { title: 'Chuyên nghiệp', audience: 'AI giáo dục và công cụ nâng cao', price: '499.000đ', period: '/tháng', items: ['AI Giáo viên', 'Tích hợp NLS, AI, hòa nhập'], action: 'Đăng ký quan tâm' },
  { title: 'Nhà trường', audience: 'Quản trị nhiều giáo viên', price: 'Liên hệ', items: ['Quản trị tập trung', 'Phân quyền và báo cáo'], action: 'Liên hệ tư vấn' },
];
export default function EduPublicLanding({ onTeacherLogin, onTeacherRegister, onStudentLogin, children, authMode = 'login' }: Props) {
  const selectAuth = (mode: 'login' | 'register') => {
    (mode === 'login' ? onTeacherLogin : onTeacherRegister)();
    document.getElementById('edu-auth')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <div data-edu-public-landing="true" className="min-h-screen bg-slate-50 font-sans text-slate-900">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
        <a href="#gioi-thieu" className="flex items-center gap-3 no-underline"><span className="rounded-xl bg-indigo-700 p-2.5 text-white"><BookOpen className="h-6 w-6"/></span><span><span className="block text-xl font-extrabold tracking-tight">Edu AI</span><span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-500">Education Operating System</span></span></a>
        <nav aria-label="Điều hướng công khai" className="flex flex-wrap items-center gap-2 text-sm">
          <a href="#gioi-thieu" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Giới thiệu</a>
          <a href="#bang-gia" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Bảng giá</a>
          <button type="button" onClick={onStudentLogin} className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Học sinh</button>
          <button type="button" onClick={()=>selectAuth('login')} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold hover:bg-slate-100">Đăng nhập</button>
          <button type="button" onClick={()=>selectAuth('register')} className="rounded-lg bg-indigo-700 px-3 py-2 font-semibold text-white hover:bg-indigo-600">Đăng ký</button>
        </nav>
      </div>
    </header>
    <main>
      <section id="gioi-thieu" className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#3730a3,transparent_55%),radial-gradient(ellipse_at_bottom_right,#155e75,transparent_55%)] opacity-75"/>
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-16">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100"><Sparkles className="h-4 w-4"/>Hệ sinh thái giáo dục tích hợp AI</div>
            <h1 className="max-w-xl text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">Một không gian.<br/><span className="text-cyan-300">Mọi công việc giáo dục.</span></h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-200 sm:text-lg">Edu AI kết nối công cụ dạy học, kiểm tra, quản lý và AI trong một hệ điều hành trực tuyến dành cho giáo viên và nhà trường.</p>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-2 sm:gap-4">
              {[['15','Chức năng giáo dục'],['6','Vai trò AI hỗ trợ'],['1','Không gian làm việc']].map(([n,label])=><div key={label} className="rounded-xl border border-white/15 bg-white/5 p-3"><div className="text-2xl font-extrabold text-white">{n}</div><p className="mt-1 text-xs text-slate-300">{label}</p></div>)}
            </div>
            <div className="mt-7 flex flex-wrap gap-4 text-xs text-slate-200"><span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-teal-300"/>Xác thực tài khoản</span><span className="flex items-center gap-1.5"><Monitor className="h-4 w-4 text-teal-300"/>Máy tính và điện thoại</span></div>
          </div>
          <section id="edu-auth" aria-label="Đăng nhập hoặc đăng ký" className="scroll-mt-4 rounded-3xl border border-white/20 bg-white p-5 text-slate-900 shadow-2xl sm:p-8">
            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><GraduationCap className="h-6 w-6"/></div><div><h2 className="text-xl font-extrabold">{children ? authMode === 'register' ? 'Tạo tài khoản Edu AI' : 'Chào mừng trở lại' : 'Bắt đầu với Edu AI'}</h2><p className="mt-1 text-xs text-slate-500">Không gian dành cho giáo viên và quản trị viên</p></div></div>
            {children || <div className="space-y-3"><p className="text-sm leading-relaxed text-slate-600">Đăng nhập bằng tài khoản đã được cấp quyền để mở hệ điều hành và các ứng dụng của bạn.</p><button type="button" onClick={()=>selectAuth('login')} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white hover:bg-indigo-600">Đăng nhập giáo viên<ArrowRight className="h-4 w-4"/></button><button type="button" onClick={()=>selectAuth('register')} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50">Đăng ký tài khoản</button></div>}
            <button type="button" onClick={onStudentLogin} className="mt-5 flex w-full items-center justify-center gap-2 border-t border-slate-200 pt-4 text-sm font-semibold text-indigo-700 hover:underline"><Users className="h-4 w-4"/>Học sinh tham gia kỳ thi</button>
          </section>
        </div>
      </section>
      <section aria-labelledby="edu-benefits" className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <h2 id="edu-benefits" className="text-2xl font-extrabold sm:text-3xl">Giá trị dành cho giáo viên và nhà trường</h2>
        <p className="mt-2 text-sm text-slate-600">Giảm thao tác lặp lại, tập trung vào chuyên môn và tổ chức dạy học.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{benefits.map(({Icon,title,desc})=><article key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><Icon className="mb-4 h-7 w-7 text-indigo-700"/><h3 className="font-bold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p></article>)}</div>
      </section>
      <section id="bang-gia" className="scroll-mt-4 border-y border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="text-center"><h2 className="text-3xl font-extrabold">Gói dịch vụ và bảng giá</h2><p className="mt-2 text-sm text-slate-600">Lựa chọn theo nhu cầu sử dụng của cá nhân và đơn vị.</p></div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">{plans.map((p,i)=><article key={p.title} className={'flex flex-col rounded-2xl border p-6 '+(i===1?'border-indigo-600 bg-indigo-50 shadow-md':'border-slate-200 bg-white')}><h3 className="text-lg font-bold">{p.title}</h3><p className="mt-1 text-sm text-slate-500">{p.audience}</p><div className="my-5"><span className="text-3xl font-extrabold">{p.price}</span>{p.period&&<span className="text-sm text-slate-500">{p.period}</span>}</div><ul className="mb-6 flex-1 space-y-3 text-sm text-slate-700">{p.items.map(item=><li key={item} className="flex items-start gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600"/>{item}</li>)}</ul>{i===2?<a href="mailto:tuyenthcskimhy@gmail.com" className="rounded-xl border border-slate-300 px-4 py-3 text-center text-sm font-semibold hover:bg-slate-50">{p.action}</a>:<button type="button" onClick={()=>selectAuth('register')} className={'rounded-xl px-4 py-3 text-sm font-semibold '+(i===1?'bg-indigo-700 text-white hover:bg-indigo-600':'border border-slate-300 hover:bg-slate-50')}>{p.action}</button>}</article>)}</div>
          <p className="mt-5 text-center text-xs text-slate-500">Thông tin gói dịch vụ mang tính giới thiệu. Đăng ký tài khoản không tự động phát sinh thanh toán; quyền truy cập theo phê duyệt và cấu hình hiện hành.</p>
        </div>
      </section>
    </main>
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500 lg:px-8"><span>Edu AI · Hệ điều hành giáo dục trực tuyến</span><a href="mailto:tuyenthcskimhy@gmail.com" className="font-medium text-indigo-700 hover:underline">Liên hệ hỗ trợ</a></footer>
  </div>;
}
