import React, { lazy, Suspense, useState } from 'react';
import {
  Accessibility,
  ArrowLeft,
  Brain,
  FileSpreadsheet,
  FileText,
  Layers3,
  Lightbulb,
  Loader2,
  MonitorCog,
  Sparkles,
} from 'lucide-react';

const TeacherDocumentAssistant = lazy(() => import('./ai/TeacherDocumentAssistant'));
const SchoolCounselingAssistant = lazy(() => import('./ai/SchoolCounselingAssistant'));
const StructuredDraftAssistant = lazy(() => import('./ai/StructuredDraftAssistant'));

type AiArea = 'education' | 'counseling';
type EducationModuleId =
  | 'digital-competency'
  | 'ai-competency'
  | 'digital-ai'
  | 'inclusive-education'
  | 'integrated'
  | 'ai-lesson-plan'
  | 'ai-competency-table'
  | 'skkn';

type DocumentMode =
  | 'digital-competency'
  | 'ai-competency'
  | 'digital-ai'
  | 'inclusive-education'
  | 'integrated';

interface EducationModuleDefinition {
  id: EducationModuleId;
  title: string;
  description: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  documentMode?: DocumentMode;
}

const EDUCATION_MODULES: EducationModuleDefinition[] = [
  {
    id: 'digital-competency',
    title: 'Tích hợp Năng lực số',
    description: 'Chọn sách → môn → lớp → tải KHGD/PPCT/giáo án hiện có → AI phân tích → duyệt → tích hợp đúng cột → tải Word.',
    badge: 'NLS',
    icon: MonitorCog,
    documentMode: 'digital-competency',
  },
  {
    id: 'ai-competency',
    title: 'Tích hợp Năng lực AI',
    description: 'Phân tích hồ sơ hiện có, đề xuất NL AI đúng bài và chèn vào cột phù hợp sau khi giáo viên duyệt.',
    badge: 'NL AI',
    icon: Brain,
    documentMode: 'ai-competency',
  },
  {
    id: 'digital-ai',
    title: 'Tích hợp NLS + AI',
    description: 'Phân tích đồng thời Năng lực số và Năng lực AI, tránh chèn lặp hoặc gượng ép.',
    badge: 'NLS + AI',
    icon: Layers3,
    documentMode: 'digital-ai',
  },
  {
    id: 'inclusive-education',
    title: 'Giáo dục hòa nhập',
    description: 'Đề xuất điều chỉnh hoạt động, hỗ trợ trực quan và cách tiếp cận phù hợp học sinh khuyết tật.',
    badge: 'Hòa nhập',
    icon: Accessibility,
    documentMode: 'inclusive-education',
  },
  {
    id: 'integrated',
    title: 'Tích hợp tổng hợp',
    description: 'Rà soát hồ sơ và đề xuất nội dung tích hợp phù hợp với từng bài, từng hoạt động.',
    badge: 'Tổng hợp',
    icon: Sparkles,
    documentMode: 'integrated',
  },
  {
    id: 'ai-lesson-plan',
    title: 'Giáo án / Chuyên đề AI',
    description: 'Soạn dự thảo kế hoạch bài dạy AI với tiến trình, đánh giá, an toàn và đạo đức AI.',
    badge: 'KHBD AI',
    icon: FileText,
  },
  {
    id: 'ai-competency-table',
    title: 'Bảng tích hợp NL AI vào KHGD',
    description: 'Tải KHGD → AI chọn bài phù hợp → giáo viên duyệt → xuất bảng Word riêng gồm Bài/chủ đề, YCCĐ, mã NL AI và nội dung tích hợp.',
    badge: 'Bảng NL AI',
    icon: FileSpreadsheet,
    documentMode: 'ai-competency',
  },
  {
    id: 'skkn',
    title: 'Sáng kiến kinh nghiệm (SKKN)',
    description: 'Tạo bản dự thảo theo thực trạng, giải pháp và minh chứng thật; không tự bịa số liệu.',
    badge: 'SKKN',
    icon: Lightbulb,
  },
];

function ModuleLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        Đang tải mô-đun AI cần dùng...
      </div>
    </div>
  );
}

export default function AIChatbot() {
  const [activeArea, setActiveArea] = useState<AiArea>('education');
  const [selectedModule, setSelectedModule] = useState<EducationModuleId | null>(null);

  const module = EDUCATION_MODULES.find(item => item.id === selectedModule) || null;

  const renderEducationModule = () => {
    if (!module) return null;

    if (module.id === 'ai-lesson-plan') return <StructuredDraftAssistant key={module.id} kind="ai-lesson-plan" />;
    if (module.id === 'skkn') return <StructuredDraftAssistant key={module.id} kind="skkn" />;

    const isCompetencyTable = module.id === 'ai-competency-table';
    return (
      <TeacherDocumentAssistant
        key={module.id}
        initialMode={module.documentMode || 'digital-competency'}
        lockedMode
        heading={module.title}
        initialDocumentType="KHGD / Phụ lục III"
        exportMode={isCompetencyTable ? 'competency-table' : 'integrated-document'}
        description={isCompetencyTable
          ? 'Chọn sách → môn → lớp → tải KHGD dạng DOCX → AI phân tích → giáo viên duyệt mã/YCCĐ/nội dung → xuất Bảng NL AI Word riêng.'
          : `${module.description} AI chỉ đề xuất; giáo viên quyết định nội dung cuối cùng.`}
      />
    );
  };

  return (
    <div className="h-full overflow-y-auto pb-6">
      <div className="mb-5 rounded-2xl bg-gradient-to-r from-indigo-700 via-violet-700 to-blue-700 p-5 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white/15 p-3"><Brain className="h-7 w-7" /></div>
          <div>
            <h1 className="text-2xl font-extrabold">AI Giáo viên</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-100">
              Bộ AI giáo dục chuyên biệt cho công việc giáo viên Việt Nam. Kiến trúc dùng gì tải nấy: mô-đun, Document Engine và Gemini chỉ tải khi thực sự sử dụng.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => { setActiveArea('education'); setSelectedModule(null); }} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeArea === 'education' ? 'bg-white text-indigo-700' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            <Sparkles className="h-4 w-4" />AI giáo dục
          </button>
          <button type="button" onClick={() => { setActiveArea('counseling'); setSelectedModule(null); }} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${activeArea === 'counseling' ? 'bg-white text-indigo-700' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            <Brain className="h-4 w-4" />Tư vấn học đường
          </button>
        </div>
      </div>

      <Suspense fallback={<ModuleLoading />}>
        {activeArea === 'counseling' ? (
          <SchoolCounselingAssistant />
        ) : selectedModule && module ? (
          <div>
            <button type="button" onClick={() => setSelectedModule(null)} className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />Quay lại 8 công cụ AI giáo dục
            </button>
            {renderEducationModule()}
          </div>
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <h2 className="font-bold text-indigo-950">8 công cụ AI giáo dục</h2>
              <p className="mt-1 text-sm leading-6 text-indigo-800">
                Chọn đúng công việc cần làm. Mỗi mô-đun được tải độc lập để giữ tốc độ trang chủ và AI Shell nhẹ.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {EDUCATION_MODULES.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedModule(item.id)} className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700 transition group-hover:bg-indigo-600 group-hover:text-white"><Icon className="h-6 w-6" /></div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{item.badge}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-extrabold text-slate-900 group-hover:text-indigo-700">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                    <span className="mt-auto pt-4 text-sm font-semibold text-indigo-600">Mở công cụ →</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </Suspense>
    </div>
  );
}
