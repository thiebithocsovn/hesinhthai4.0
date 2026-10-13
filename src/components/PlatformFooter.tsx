import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  GraduationCap,
  HeartHandshake,
  Layers,
  Mail,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ECOSYSTEM_APPLICATIONS, type EcosystemApplicationId } from '../ecosystem';
import {
  PLATFORM_HEARTBEAT_INTERVAL_MS,
  PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS,
  cachePublicPlatformSnapshot,
  cacheRegistrationMetrics,
  formatPlatformCount,
  getOrCreateVisitorIdentifier,
  readCachedPublicPlatformSnapshot,
  readCachedRegistrationMetrics,
  readPublicPlatformSnapshot,
  recordLocalPresence,
  recordLocalVisit,
  shouldRefreshPublicPlatformSnapshot,
  summarizeTeacherRegistrations,
  type PublicPlatformMetrics,
  type RegisteredTeacherSummaryInput,
} from '../lib/platformMetrics';
import {
  getPwaInstallationInstructions,
  isInstalledPwa,
  promptPwaInstallation,
} from '../lib/plickerPwa';

interface PlatformFooterProps {
  onTeacherRegister: () => void;
  onTeacherLogin: () => void;
  onStudentLogin: () => void;
  onOpenProduct: (application: EcosystemApplicationId) => void;
}

interface MetricCard {
  label: string;
  detail: string;
  value: number | null;
  icon: LucideIcon;
  accent: string;
  isLive?: boolean;
}

const DEFAULT_METRICS: PublicPlatformMetrics = {
  totalVisits: 0,
  onlineVisitors: 0,
  registeredSchools: 0,
  registeredTeachers: 0,
  activeTeachers: 0,
  classrooms: null,
  students: null,
  exams: null,
  hasRegistrationData: false,
  isFirebaseConnected: false,
};

export async function publishPlatformRegistrationMetrics(
  teachers: readonly RegisteredTeacherSummaryInput[],
): Promise<void> {
  const summary = summarizeTeacherRegistrations(teachers);
  if (typeof window !== 'undefined') {
    cacheRegistrationMetrics(window.localStorage, summary);
  }

  await setDoc(doc(db, 'platform_stats', 'overview'), {
    ...summary,
    updatedAt: serverTimestamp(),
  });
}

function usePlatformMetrics(): PublicPlatformMetrics {
  const [metrics, setMetrics] = useState<PublicPlatformMetrics>(DEFAULT_METRICS);

  useEffect(() => {
    let mounted = true;
    let publishedOnlineVisitors = 0;
    let snapshotRequest: AbortController | null = null;
    const visitorId = getOrCreateVisitorIdentifier(window.localStorage);
    const localVisits = recordLocalVisit(window.localStorage, window.sessionStorage);
    const localRegistration = readCachedRegistrationMetrics(window.localStorage);
    const cachedSnapshot = readCachedPublicPlatformSnapshot(window.localStorage);

    const update = (changes: Partial<PublicPlatformMetrics>) => {
      if (mounted) setMetrics(current => ({ ...current, ...changes }));
    };

    const heartbeat = () => {
      const localOnline = navigator.onLine ? recordLocalPresence(window.localStorage, visitorId) : 0;
      update({ onlineVisitors: Math.max(localOnline, publishedOnlineVisitors) });
    };

    update({
      totalVisits: localVisits,
      onlineVisitors: navigator.onLine ? 1 : 0,
      ...(cachedSnapshot?.metrics || {}),
      ...(localRegistration ? { ...localRegistration, hasRegistrationData: true } : {}),
    });
    publishedOnlineVisitors = cachedSnapshot?.metrics.onlineVisitors || 0;
    heartbeat();

    const refreshPublishedSnapshot = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;

      const latest = readCachedPublicPlatformSnapshot(window.localStorage);
      if (!shouldRefreshPublicPlatformSnapshot(latest)) return;

      snapshotRequest?.abort();
      snapshotRequest = new AbortController();

      try {
        const response = await fetch(`${import.meta.env.BASE_URL}platform-stats.json`, {
          cache: 'default',
          credentials: 'same-origin',
          signal: snapshotRequest.signal,
        });
        if (!response.ok || !mounted) return;

        const value: unknown = await response.json();
        let published = readPublicPlatformSnapshot(value);
        let connectedToFirebase = false;

        if (!published?.hasRegistrationData) {
          try {
            const aggregate = await getDoc(doc(db, 'platform_stats', 'overview'));
            const cloudMetrics = aggregate.exists()
              ? readPublicPlatformSnapshot(aggregate.data())
              : null;
            if (cloudMetrics) {
              published = { ...(published || {}), ...cloudMetrics };
              connectedToFirebase = true;
            }
          } catch {
            // Static CDN metrics and local counters remain available before Rules are published.
          }
        }

        if (!published) return;

        cachePublicPlatformSnapshot(window.localStorage, published);
        publishedOnlineVisitors = published.onlineVisitors || 0;
        const localOnline = navigator.onLine ? recordLocalPresence(window.localStorage, visitorId) : 0;
        update({
          ...published,
          totalVisits: Math.max(published.totalVisits || 0, localVisits),
          onlineVisitors: Math.max(publishedOnlineVisitors, localOnline),
          isFirebaseConnected: connectedToFirebase || Object.keys(published).length > 0,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.info('Thống kê đang sử dụng dữ liệu đã lưu trên thiết bị.');
      }
    };

    void refreshPublishedSnapshot();
    const heartbeatInterval = window.setInterval(heartbeat, PLATFORM_HEARTBEAT_INTERVAL_MS);
    const snapshotInterval = window.setInterval(refreshPublishedSnapshot, PLATFORM_SNAPSHOT_REFRESH_INTERVAL_MS);
    const handleConnectivityChange = () => {
      heartbeat();
      void refreshPublishedSnapshot();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
        void refreshPublishedSnapshot();
      }
    };
    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      snapshotRequest?.abort();
      window.clearInterval(heartbeatInterval);
      window.clearInterval(snapshotInterval);
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return metrics;
}

export default function PlatformFooter({
  onTeacherRegister,
  onTeacherLogin,
  onStudentLogin,
  onOpenProduct,
}: PlatformFooterProps) {
  const metrics = usePlatformMetrics();
  const [installed, setInstalled] = useState(() => isInstalledPwa());

  const installPlatform = async () => {
    const result = await promptPwaInstallation();
    if (result === 'accepted') {
      setInstalled(true);
      return;
    }
    if (result === 'unavailable') {
      window.alert(getPwaInstallationInstructions(navigator.userAgent));
    }
  };

  const cards: MetricCard[] = [
    {
      label: 'Lượt truy cập',
      detail: metrics.isFirebaseConnected ? 'Số liệu tổng hợp đã xác minh' : 'Phiên ghi nhận trên thiết bị',
      value: metrics.totalVisits,
      icon: BarChart3,
      accent: 'from-sky-400 to-blue-500',
    },
    {
      label: 'Trường đăng ký',
      detail: 'Đơn vị giáo dục đồng hành',
      value: metrics.hasRegistrationData ? metrics.registeredSchools : null,
      icon: Building2,
      accent: 'from-violet-400 to-indigo-500',
    },
    {
      label: 'Giáo viên tham gia',
      detail: 'Tài khoản đã đăng ký',
      value: metrics.hasRegistrationData ? metrics.registeredTeachers : null,
      icon: GraduationCap,
      accent: 'from-amber-400 to-orange-500',
    },
    {
      label: 'Đang trực tuyến',
      detail: 'Phiên hoạt động và số liệu tổng hợp',
      value: metrics.onlineVisitors,
      icon: Activity,
      accent: 'from-emerald-400 to-teal-500',
      isLive: true,
    },
    {
      label: 'Lớp học số',
      detail: 'Lớp học đã được tạo',
      value: metrics.classrooms,
      icon: Layers,
      accent: 'from-cyan-400 to-sky-500',
    },
    {
      label: 'Học sinh tham gia',
      detail: 'Dữ liệu học sinh thực tế',
      value: metrics.students,
      icon: Users,
      accent: 'from-pink-400 to-rose-500',
    },
    {
      label: 'Kỳ thi đã tạo',
      detail: 'Kỳ thi trên hệ thống',
      value: metrics.exams,
      icon: ClipboardCheck,
      accent: 'from-fuchsia-400 to-purple-500',
    },
    {
      label: 'Ứng dụng giáo dục',
      detail: 'Sẵn sàng hỗ trợ dạy học',
      value: ECOSYSTEM_APPLICATIONS.length,
      icon: Sparkles,
      accent: 'from-lime-400 to-emerald-500',
    },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-slate-800 bg-slate-950 text-slate-300">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_85%_12%,rgba(16,185,129,0.12),transparent_30%)]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-8 pt-16 sm:px-6 lg:px-8">
        <section aria-labelledby="platform-community-heading">
          <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                <Activity className="h-4 w-4" />
                Hệ sinh thái đang phát triển
              </div>
              <h2 id="platform-community-heading" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Cộng đồng giáo dục chuyển đổi số
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
                Mỗi lượt truy cập, lớp học và kỳ thi được thống kê từ dữ liệu thực tế; thông tin cá nhân của giáo viên và học sinh không được công khai.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              {metrics.isFirebaseConnected ? 'Số liệu tổng hợp đã đồng bộ' : 'Hệ thống sẵn sàng trên thiết bị'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {cards.map(card => {
              const Icon = card.icon;

              return (
                <article
                  key={card.label}
                  className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] sm:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-white shadow-lg sm:h-11 sm:w-11`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {card.isLive && (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Live
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                    {formatPlatformCount(card.value)}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-slate-100">{card.label}</h3>
                  <p className="mt-1 hidden text-xs leading-5 text-slate-400 sm:block">{card.detail}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="relative mt-12 overflow-hidden rounded-3xl border border-indigo-400/25 bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-emerald-500/15 p-6 sm:p-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <HeartHandshake className="h-5 w-5" />
                Dành cho giáo viên và nhà trường Việt Nam
              </div>
              <h3 className="text-2xl font-bold text-white sm:text-3xl">Sẵn sàng tạo tiết học khiến học sinh hào hứng?</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Đăng ký để sử dụng lớp học tương tác, nhận diện cử chỉ, thẻ Plicker, quản lý kỳ thi và trợ lý học đường AI trên cùng một nền tảng.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-3 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={onTeacherRegister}
                className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-400 px-6 py-3.5 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                Giáo viên đăng ký miễn phí
                <ArrowRight className="h-4 w-4" />
              </button>
              {!installed && (
                <button
                  type="button"
                  onClick={() => void installPlatform()}
                  className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-sky-300 hover:text-sky-200"
                >
                  <Download className="h-4 w-4" />
                  Cài ứng dụng trên thiết bị
                </button>
              )}
            </div>
          </div>
        </section>

        <div className="mt-14 grid gap-10 border-t border-white/10 pt-12 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 p-2 text-white">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="text-base font-bold text-white">Lớp Học Thông Minh 4.0</span>
            </div>
            <p className="text-sm leading-7 text-slate-400">
              Hệ sinh thái giáo dục số hỗ trợ giáo viên đổi mới phương pháp dạy học, tăng tương tác và quản lý lớp học hiệu quả.
            </p>
            <a
              href="mailto:tuyenthcskimhy@gmail.com"
              className="mt-4 inline-flex items-center gap-2 text-sm text-sky-200 transition hover:text-white"
            >
              <Mail className="h-4 w-4" />
              Hỗ trợ triển khai cho nhà trường
            </a>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">Giải pháp nổi bật</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><button type="button" onClick={() => onOpenProduct('gesture-class')} className="transition hover:text-white">Lớp học tương tác GestureClass</button></li>
              <li><button type="button" onClick={() => onOpenProduct('plicker')} className="transition hover:text-white">Tương tác thẻ Plicker</button></li>
              <li><button type="button" onClick={() => onOpenProduct('exam-manager')} className="transition hover:text-white">Quản lý kỳ thi trực tuyến</button></li>
              <li><button type="button" onClick={() => onOpenProduct('chatbot')} className="transition hover:text-white">Tư vấn học đường AI</button></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">Dành cho giáo viên</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li><button type="button" onClick={onTeacherRegister} className="transition hover:text-white">Đăng ký tài khoản miễn phí</button></li>
              <li><button type="button" onClick={onTeacherLogin} className="transition hover:text-white">Đăng nhập quản lý lớp học</button></li>
              <li><button type="button" onClick={onStudentLogin} className="transition hover:text-white">Cổng đăng nhập học sinh</button></li>
              <li><a href="#san-pham" className="transition hover:text-white">Khám phá toàn bộ ứng dụng</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-white">Cam kết nền tảng</h4>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" /> Bảo vệ dữ liệu cá nhân</li>
              <li className="flex items-center gap-2"><MonitorPlay className="h-4 w-4 shrink-0 text-sky-300" /> Chạy trên điện thoại và máy tính</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /> Dữ liệu thống kê minh bạch</li>
              <li className="flex items-center gap-2"><Wifi className="h-4 w-4 shrink-0 text-indigo-300" /> Cập nhật trạng thái trực tuyến</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Lớp Học Thông Minh 4.0. Đồng hành cùng giáo viên Việt Nam.</p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Không công khai dữ liệu cá nhân</span>
            <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Hệ thống sẵn sàng phục vụ</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
