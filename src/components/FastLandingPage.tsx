import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  Gamepad2,
  Layers,
  Layout,
  ListChecks,
  MonitorPlay,
  QrCode,
  Smile,
  Target,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  ECOSYSTEM_APPLICATIONS,
  ECOSYSTEM_DEPENDENCY_LABELS,
  type EcosystemApplicationId,
} from '../ecosystem';

const PlatformFooter = lazy(() => import('./PlatformFooter'));

const PRODUCT_ICONS: Record<EcosystemApplicationId, LucideIcon> = {
  'gesture-class': MonitorPlay,
  'question-studio': ListChecks,
  'lucky-draw': Target,
  'lucky-draw-cards': Layers,
  plicker: QrCode,
  'learning-wall': Layout,
  'head-shake-game': Smile,
  chatbot: Brain,
  'exam-manager': ClipboardCheck,
  'secret-box': Layers,
  'drag-drop-game': Gamepad2,
  'excel-merger': FileSpreadsheet,
  'pdf-merger': FileText,
};

interface FastLandingPageProps {
  onTeacherLogin: () => void;
  onTeacherRegister: () => void;
  onStudentLogin: () => void;
  onOpenProduct: (applicationId: EcosystemApplicationId) => void;
}

function DeferredFooter(props: FastLandingPageProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const activate = () => setReady(true);
    const browser = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (browser.requestIdleCallback) {
      const id = browser.requestIdleCallback(activate, { timeout: 2500 });
      return () => browser.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(activate, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return <div className="h-20 border-t border-slate-200 bg-white" aria-hidden="true" />;

  return (
    <Suspense fallback={<div className="h-20 border-t border-slate-200 bg-white" aria-hidden="true" />}>
      <PlatformFooter
        onTeacherRegister={props.onTeacherRegister}
        onTeacherLogin={props.onTeacherLogin}
        onStudentLogin={props.onStudentLogin}
        onOpenProduct={props.onOpenProduct}
      />
    </Suspense>
  );
}

export default function FastLandingPage(props: FastLandingPageProps) {
  const browserTools = ECOSYSTEM_APPLICATIONS.filter(application => application.dependency === 'browser').length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-600 p-2 text-white"><BookOpen className="h-6 w-6" /></div>
            <span className="font-bold text-xl tracking-tight text-indigo-950">Lớp Học Thông Minh 4.0</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden items-center gap-6 md:flex">
              <a href="#san-pham" className="text-sm font-medium text-slate-600 hover:text-indigo-600">Sản phẩm</a>
              <a href="#bang-gia" className="text-sm font-medium text-slate-600 hover:text-indigo-600">Bảng giá</a>
            </nav>
            <button onClick={props.onStudentLogin} className="hidden items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 sm:flex"><User className="h-4 w-4" />Học sinh</button>
            <button onClick={props.onTeacherLogin} className="hidden text-sm font-medium text-slate-600 hover:text-indigo-600 sm:block">Giáo viên</button>
            <button onClick={props.onTeacherRegister} className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Đăng ký</button>
          </div>
        </div>
      </header>

      <main>
        <section
          className="relative isolate overflow-hidden bg-cover bg-center bg-no-repeat px-4 pb-24 pt-28 sm:px-6 lg:px-8"
          style={{ backgroundImage: `url("${import.meta.env.BASE_URL}homepage-classroom-background.jpg")` }}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/70" />
          <div className="relative z-10 mx-auto max-w-7xl text-center">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/25 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm"><Zap className="h-4 w-4 text-yellow-400" />Cơ hội phát triển cùng giáo dục Việt Nam</div>
            <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-white drop-shadow-lg md:text-7xl">Định hình tương lai giáo dục<br className="hidden md:block" /><span className="text-amber-200"> Giơ tay là điều khiển, học là cuốn</span></h1>
            <p className="mx-auto mb-10 max-w-3xl text-lg text-white/90 drop-shadow-md md:text-xl">Hệ sinh thái công cụ lớp học, kiểm tra, tương tác và AI giáo dục — tải theo nhu cầu để giáo viên vào hệ thống nhanh hơn.</p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button onClick={props.onStudentLogin} className="flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-emerald-400"><User className="h-5 w-5" />Học sinh đăng nhập</button>
              <button onClick={props.onTeacherRegister} className="flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:from-blue-500 hover:to-indigo-500">Giáo viên đăng ký <ArrowRight className="h-5 w-5" /></button>
            </div>
            <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-8 border-t border-white/25 pt-10 md:grid-cols-4">
              <div><div className="mb-2 text-4xl font-bold text-white">{ECOSYSTEM_APPLICATIONS.length}</div><div className="text-sm text-white/85">Ứng dụng giáo dục</div></div>
              <div><div className="mb-2 text-4xl font-bold text-white">{browserTools}</div><div className="text-sm text-white/85">Công cụ trên thiết bị</div></div>
              <div><div className="mb-2 text-4xl font-bold text-white">21</div><div className="text-sm text-white/85">Điểm nhận dạng bàn tay</div></div>
              <div><div className="mb-2 text-4xl font-bold text-white">A–D</div><div className="text-sm text-white/85">Đáp án bằng cử chỉ</div></div>
            </div>
          </div>
        </section>

        <section id="san-pham" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-14 text-center"><h2 className="mb-4 text-4xl font-extrabold text-slate-900">Hệ sinh thái sản phẩm</h2><p className="mx-auto max-w-2xl text-lg text-slate-600">Mỗi ứng dụng chỉ tải khi giáo viên mở, tránh bắt trang chủ gánh toàn bộ hệ sinh thái.</p></div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {ECOSYSTEM_APPLICATIONS.map(application => {
                const ProductIcon = PRODUCT_ICONS[application.id];
                return (
                  <button key={application.id} type="button" onClick={() => props.onOpenProduct(application.id)} className="group flex min-h-60 flex-col rounded-3xl border border-slate-200 bg-white p-7 text-left transition hover:border-indigo-400 hover:shadow-xl">
                    <div className="mb-5 flex items-start justify-between gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg"><ProductIcon className="h-7 w-7" /></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">{ECOSYSTEM_DEPENDENCY_LABELS[application.dependency]}</span></div>
                    <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">{application.category}</span>
                    <h3 className="mb-3 text-xl font-bold text-slate-900 group-hover:text-indigo-700">{application.name}</h3>
                    <p className="text-sm leading-6 text-slate-600">{application.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section id="bang-gia" className="bg-white py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="mb-14 text-center"><h2 className="mb-4 text-3xl font-bold text-slate-900">Bảng giá linh hoạt</h2><p className="text-slate-600">Trò chơi và công cụ giúp giáo viên trải nghiệm; AI giáo dục có thể nâng cấp theo gói sử dụng.</p></div>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><h3 className="mb-2 text-lg font-semibold">Cơ bản</h3><p className="mb-6 text-sm text-slate-500">Dành cho giáo viên cá nhân</p><div className="mb-6 text-4xl font-bold">Miễn phí</div><ul className="mb-8 space-y-3 text-slate-600"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Dùng thử các công cụ</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Lưu dữ liệu theo tài khoản</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-indigo-50 px-4 py-3 font-medium text-indigo-600 hover:bg-indigo-100">Đăng ký ngay</button></div>
              <div className="relative rounded-3xl border border-indigo-500 bg-indigo-600 p-8 text-white shadow-xl md:-translate-y-3"><div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 px-4 py-1 text-xs font-bold uppercase">Phổ biến</div><h3 className="mb-2 text-lg font-semibold">Chuyên nghiệp</h3><p className="mb-6 text-sm text-indigo-200">AI giáo dục + công cụ nâng cao</p><div className="mb-6"><span className="text-4xl font-bold">499.000đ</span><span className="text-indigo-200">/tháng</span></div><ul className="mb-8 space-y-3 text-indigo-50"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-indigo-200" />AI Giáo viên</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-indigo-200" />Tích hợp NLS, AI, hòa nhập</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-white px-4 py-3 font-medium text-indigo-600 hover:bg-slate-50">Dùng thử</button></div>
              <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><h3 className="mb-2 text-lg font-semibold">Nhà trường</h3><p className="mb-6 text-sm text-slate-500">Quản trị nhiều giáo viên</p><div className="mb-6 text-4xl font-bold">Liên hệ</div><ul className="mb-8 space-y-3 text-slate-600"><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Quản trị tập trung</li><li className="flex gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-500" />Phân quyền và báo cáo</li></ul><button onClick={props.onTeacherRegister} className="w-full rounded-xl bg-indigo-50 px-4 py-3 font-medium text-indigo-600 hover:bg-indigo-100">Nhận báo giá</button></div>
            </div>
          </div>
        </section>
      </main>

      <DeferredFooter {...props} />
    </div>
  );
}
