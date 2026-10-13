import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, Copy, ExternalLink, Download, Save, LoaderCircle, ClipboardCheck, BookOpen, TrendingUp } from 'lucide-react';
import type { WallCategory, WallPost } from '../../lib/learningWall';
import { WALL_AI_SOURCES, VERDICT_LABELS, approvedWallAssessment, assignWallPractice, createWallAiRequest,
  newWallAssessment, parseWallAnalysis, parseWallPractice, recordWallPracticeAttempt, studentWallFeedback,
  studentWallWorksheet, wallAnalysisPrompt, wallAssessmentVersion, wallPracticePrompt, wallWorkRevision,
  type WallAiRequest, type WallAiSource, type WallAssessment, type WallAssessmentContext, type WallLearningError,
  type WallPracticeExercise, type PracticeVerdict } from '../../lib/learningWallAssessment';
import WallAiProgress, { downloadWallText } from './WallAiProgress';

interface Props {
  post: WallPost;
  posts: WallPost[];
  board: WallCategory;
  ownerUid: string;
  displayName: string;
  offline: boolean;
  onSave: (post: WallPost, assessment: WallAssessment, expected: WallAssessment | null, approve?: boolean) => Promise<WallAssessment>;
}
type Transfer = { kind: 'analysis'; prompt: string; request: WallAiRequest; source: WallAiSource }
  | { kind: 'practice'; prompt: string; id: string; assessmentVersion: string; source: WallAiSource };
const STEPS = [
  { title: 'Phân tích', icon: Sparkles }, { title: 'Giáo viên duyệt', icon: ClipboardCheck },
  { title: 'Luyện tập', icon: BookOpen }, { title: 'Tiến bộ', icon: TrendingUp },
];

export default function WallAiAssessment({ post, posts, board, ownerUid, displayName, offline, onSave }: Props) {
  const [step, setStep] = useState(post.aiAssessment ? 1 : 0);
  const [source, setSource] = useState<WallAiSource>('firebase-gemini');
  const [context, setContext] = useState<WallAssessmentContext>(post.aiAssessment?.context || {
    subject: '', grade: '', task: board.wallDescription || '', criteria: '', transcript: '',
  });
  const [includeMedia, setIncludeMedia] = useState(true);
  const [assessment, setAssessment] = useState<WallAssessment | null>(post.aiAssessment || null);
  const [score, setScore] = useState(String(post.aiAssessment?.review.score ?? post.score ?? ''));
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [stale, setStale] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const baseline = useRef(post.aiAssessment || null);
  const mounted = useRef(true);
  const running = useRef(false);
  const [exerciseId, setExerciseId] = useState('');
  const [response, setResponse] = useState('');
  const [evidence, setEvidence] = useState('');
  const [verdict, setVerdict] = useState<PracticeVerdict | ''>('');
  const approved = assessment?.review.status === 'approved';
  const dirty = wallAssessmentVersion(assessment) !== wallAssessmentVersion(baseline.current);
  const selectedSource = WALL_AI_SOURCES.find(item => item.id === source)!;
  const confirmed = assessment?.analysis.errors.filter(item => item.decision === 'confirmed') || [];
  const disabled = busy || offline || stale || externalChange;
  const exercise = assessment?.practice?.exercises.find(item => item.id === exerciseId);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    wallWorkRevision(post).then(revision => {
      if (active) setStale(Boolean(assessment && revision !== assessment.workRevision));
    }).catch(() => { if (active) setError('Trình duyệt chưa kiểm tra được phiên bản bài làm. Hãy tải lại trang.'); });
    return () => { active = false; };
  }, [post.title, post.text, post.imageSrc, post.attachments, post.studentName, assessment?.workRevision]);
  useEffect(() => {
    setExternalChange(wallAssessmentVersion(post.aiAssessment || null) !== wallAssessmentVersion(baseline.current));
  }, [post.aiAssessment]);

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa thực hiện được. Hãy thử lại.'); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }
  async function persist(next: WallAssessment, approve = false) {
    if (!mounted.current) return;
    const saved = await onSave(post, next, baseline.current, approve);
    if (!mounted.current) return;
    baseline.current = saved; setAssessment(saved); setExternalChange(false);
    setScore(String(saved.review.score ?? post.score ?? ''));
    setMessage(approve ? 'Giáo viên đã duyệt và lưu nhận xét cùng điểm.' : 'Đã lưu vào hồ sơ riêng của bài làm.');
  }
  function editError(id: string, patch: Partial<WallLearningError>) {
    if (!assessment || approved) return;
    setAssessment({ ...assessment, analysis: { ...assessment.analysis,
      errors: assessment.analysis.errors.map(item => item.id === id ? { ...item, ...patch } : item) } });
  }
  function editExercise(id: string, patch: Partial<WallPracticeExercise>) {
    if (!assessment?.practice || assessment.practice.status === 'assigned') return;
    setAssessment({ ...assessment, practice: { ...assessment.practice,
      exercises: assessment.practice.exercises.map(item => item.id === id ? { ...item, ...patch } : item) } });
  }
  function resetTransfer() { setTransfer(null); setImportText(''); }
  async function analyze() {
    const request = await createWallAiRequest(post, context, includeMedia);
    if (!mounted.current) return;
    resetTransfer();
    const { analyzeWallWork } = await import('../../lib/learningWallAi');
    const result = await analyzeWallWork(request);
    if (!mounted.current) return;
    const next = newWallAssessment(request, result.analysis, 'firebase-gemini', result.model);
    next.studentCode = assessment?.studentCode || '';
    setAssessment(next); setStep(1); await persist(next);
  }
  async function prepareTransfer(kind: 'analysis' | 'practice') {
    if (source === 'firebase-gemini') return;
    if (kind === 'analysis') {
      const request = await createWallAiRequest(post, context, includeMedia);
      if (!mounted.current) return;
      const prompt = wallAnalysisPrompt(request);
      setTransfer({ kind, request, prompt, source }); setImportText('');
      await navigator.clipboard.writeText(prompt);
    } else if (assessment) {
      const id = crypto.randomUUID(), prompt = wallPracticePrompt(assessment, id);
      setTransfer({ kind, id, prompt, source, assessmentVersion: wallAssessmentVersion(assessment) }); setImportText('');
      await navigator.clipboard.writeText(prompt);
    }
    if (mounted.current) setMessage(`Đã sao chép yêu cầu. Mở ${selectedSource.label.split(' ')[0]}, dán yêu cầu${kind === 'analysis' ? ' và tải kèm ảnh/PDF bài làm' : ''}, rồi nhập phản hồi JSON bên dưới.`);
  }
  async function acceptTransfer() {
    if (!transfer) throw new Error('Hãy sao chép yêu cầu của bài này trước.');
    if (transfer.kind === 'analysis') {
      if (await wallWorkRevision(post) !== transfer.request.workRevision) throw new Error('Bài làm đã thay đổi. Hãy tạo yêu cầu mới.');
      const next = newWallAssessment(transfer.request, parseWallAnalysis(importText, transfer.request.id), transfer.source, 'Tài khoản AI cá nhân · Nhập kết quả');
      next.studentCode = assessment?.studentCode || '';
      setAssessment(next); setStep(1); resetTransfer(); await persist(next);
    } else if (assessment) {
      if (wallAssessmentVersion(assessment) !== transfer.assessmentVersion) throw new Error('Phân tích đã thay đổi. Hãy tạo lại yêu cầu luyện tập.');
      const plan = parseWallPractice(importText, transfer.id, assessment, transfer.source, 'Tài khoản AI cá nhân · Nhập kết quả');
      const next = { ...assessment, practice: plan }; setAssessment(next); resetTransfer(); await persist(next);
    }
  }
  async function generatePractice() {
    if (!assessment || dirty) throw new Error('Lưu các thay đổi trước khi tạo luyện tập.');
    const id = crypto.randomUUID();
    wallPracticePrompt(assessment, id); // Enforce approved causes before any provider request.
    const { generateWallPractice } = await import('../../lib/learningWallAi');
    const plan = await generateWallPractice(assessment, id);
    if (!mounted.current) return;
    const next = { ...assessment, practice: plan }; setAssessment(next); await persist(next);
  }
  function reloadSaved() {
    baseline.current = post.aiAssessment || null; setAssessment(baseline.current);
    setContext(post.aiAssessment?.context || context); setScore(String(post.aiAssessment?.review.score ?? post.score ?? ''));
    setExternalChange(false); resetTransfer(); setError('');
  }
  const transferPanel = transfer && ((step === 0 && transfer.kind === 'analysis') || (step === 2 && transfer.kind === 'practice')) && <div className="lw-ai-transfer">
    <p className="lw-help">1. Mở AI và dán yêu cầu. 2. Tải kèm ảnh/PDF nếu phân tích ảnh. 3. Sao chép toàn bộ JSON trả về và dán ở đây.</p>
    <details><summary>Xem / chọn yêu cầu để sao chép thủ công</summary><textarea aria-label="Yêu cầu gửi AI" readOnly rows={8} value={transfer.prompt} onFocus={event => event.target.select()} /></details>
    {transfer.kind === 'analysis' && transfer.request.media.length > 0 && <div className="lw-row lw-ai-wrap">{transfer.request.media.map((file, index) => <button type="button" className="lw-button" key={index} onClick={() => {
      const bytes = Uint8Array.from(atob(file.data), character => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Bai_lam_${index + 1}.${file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.split('/')[1]}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={15} />Tải tệp {index + 1} để gửi AI</button>)}</div>}
    <label>Kết quả JSON từ AI<textarea aria-label="Kết quả JSON từ AI" rows={6} maxLength={150000} value={importText} onChange={event => setImportText(event.target.value)} placeholder={'{"requestId": "…", …}'} /></label>
    <button type="button" className="lw-button lw-primary" disabled={busy || offline || externalChange || !importText.trim()} onClick={() => void run(acceptTransfer)}><Check size={16} />{transfer.kind === 'analysis' ? 'Nhập phân tích dưới dạng bản nháp' : 'Nhập bài luyện tập để duyệt'}</button>
  </div>;

  return <section className="lw-ai-assessment" aria-label="Trợ lý AI cho bài làm">
    <div className="lw-ai-heading"><span className="lw-ai-icon"><Sparkles size={24} /></span><div><h3>Trợ lý AI cho bài làm</h3><p>Phát hiện lỗi · Kiểm chứng nguyên nhân · Luyện tập · Tiến bộ</p></div><span className={`lw-ai-status ${approved ? 'is-resolved' : ''}`}>{approved ? 'Giáo viên đã duyệt' : 'Giáo viên quyết định'}</span></div>
    <nav className="lw-ai-steps" aria-label="Các bước nhận xét AI">{STEPS.map((item, index) => <button key={item.title} type="button" aria-current={step === index ? 'step' : undefined} onClick={() => { if (!busy) { setStep(index); setError(''); } }} disabled={busy}><item.icon size={17} /><span>{index + 1}. {item.title}</span></button>)}</nav>
    {offline && <p role="alert" className="lw-ai-warning">Đang mất mạng. Nội dung đang soạn được giữ trong cửa sổ này; kết nối lại để lưu.</p>}
    {stale && <p role="alert" className="lw-ai-warning">Bài làm đã thay đổi sau lần phân tích. Mở bước Phân tích để phân tích lại; dữ liệu cũ chưa được áp dụng cho bài mới.</p>}
    {externalChange && <div className="lw-ai-warning" role="alert">Dữ liệu đã thay đổi ở cửa sổ khác. <button type="button" className="lw-button" onClick={reloadSaved}>Tải bản đã lưu</button></div>}
    {error && <p role="alert" className="lw-inline-error">{error}</p>}
    {message && <p role="status" className="lw-ai-success">{message}</p>}
    {busy && <p role="status" className="lw-ai-busy"><LoaderCircle size={17} className="lw-ai-spin" />Đang xử lý…</p>}

    {(step === 0 || step === 2) && <div className="lw-ai-provider"><label>Chọn cách dùng AI<select aria-label="Chọn cách dùng AI" disabled={busy} value={source} onChange={event => { setSource(event.target.value as WallAiSource); resetTransfer(); }}>
      {WALL_AI_SOURCES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label><p className="lw-help">{source === 'firebase-gemini' ? 'Phân tích trực tiếp qua Gemini của dự án Firebase. Cần Firebase AI Logic hoạt động; không nhập khóa AI vào giao diện.' : 'Dùng phiên đăng nhập hiện có trên website AI. Sao chép yêu cầu, mở AI, rồi nhập kết quả. Bản này chưa tự đăng nhập hoặc gọi tài khoản AI cá nhân.'}</p></div>}

    {step === 0 && <div className="lw-ai-section">
      <div className="lw-form-grid"><label>Môn học<input maxLength={120} value={context.subject} disabled={busy} onChange={event => { setContext({ ...context, subject: event.target.value }); resetTransfer(); }} placeholder="Ví dụ: Tin học" /></label><label>Khối / lớp<input maxLength={80} value={context.grade} disabled={busy} onChange={event => { setContext({ ...context, grade: event.target.value }); resetTransfer(); }} placeholder="Ví dụ: Lớp 8" /></label></div>
      <label>Đề bài / nhiệm vụ cần đánh giá<textarea rows={3} maxLength={4000} value={context.task} disabled={busy} onChange={event => { setContext({ ...context, task: event.target.value }); resetTransfer(); }} placeholder="Nhập yêu cầu để AI đối chiếu đúng nhiệm vụ…" /></label>
      <label>Đáp án / tiêu chí đánh giá<textarea rows={3} maxLength={4000} value={context.criteria} disabled={busy} onChange={event => { setContext({ ...context, criteria: event.target.value }); resetTransfer(); }} placeholder="Nội dung đúng, mức độ yêu cầu, tiêu chí của giáo viên…" /></label>
      <details><summary>Bổ sung nội dung đọc từ tài liệu</summary><label>Nội dung bài làm bổ sung<textarea rows={4} maxLength={12000} value={context.transcript} disabled={busy} onChange={event => { setContext({ ...context, transcript: event.target.value }); resetTransfer(); }} placeholder="Dán nội dung Word/PowerPoint/Excel hoặc phần chữ khó đọc trên ảnh…" /></label></details>
      <label className="lw-checkbox"><input type="checkbox" checked={includeMedia} disabled={busy} onChange={event => { setIncludeMedia(event.target.checked); resetTransfer(); }} />Gửi kèm ảnh / PDF tải trực tiếp của bài làm</label>
      <p className="lw-help">AI nhận nội dung chữ, TXT/CSV và ảnh/PDF tải trực tiếp. Word, Excel, PowerPoint và liên kết ngoài cần dán nội dung hoặc tải vào AI cá nhân. Tên học sinh, điểm và nhận xét riêng không nằm trong yêu cầu; kiểm tra thông tin có trong bài làm trước khi gửi.</p>
      <div className="lw-row lw-ai-wrap">{source === 'firebase-gemini' ? <button type="button" className="lw-button lw-primary" disabled={busy || offline || externalChange || !context.task.trim()} onClick={() => void run(analyze)}><Sparkles size={17} />{assessment ? 'Phân tích lại bài làm' : 'AI phân tích bài làm'}</button> : <><button type="button" className="lw-button lw-primary" disabled={busy || offline || externalChange || !context.task.trim()} onClick={() => void run(() => prepareTransfer('analysis'))}><Copy size={17} />Sao chép yêu cầu phân tích</button><a className="lw-button" href={selectedSource.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Mở AI đang dùng</a></>}</div>
      {assessment && <p className="lw-help">Phân tích lại tạo bản nháp mới. Bản đã duyệt và các lượt luyện tập trước được lưu trong lịch sử khi bản mới được lưu.</p>}
      {transferPanel}
    </div>}

    {step === 1 && (!assessment ? <p className="lw-ai-empty">Mở bước Phân tích và chạy AI hoặc nhập kết quả từ tài khoản AI đang dùng.</p> : <div className="lw-ai-section">
      <div className="lw-ai-summary"><p className="lw-eyebrow">{WALL_AI_SOURCES.find(item => item.id === assessment.source)?.label} · {new Date(assessment.analyzedAt).toLocaleString('vi-VN')}</p><h4>Nhận định từ bài làm</h4><p>{assessment.analysis.summary}</p>{assessment.analysis.strengths.length > 0 && <><strong>Điểm làm tốt</strong><ul>{assessment.analysis.strengths.map((value, index) => <li key={index}>{value}</li>)}</ul></>}{assessment.analysis.limitations.length > 0 && <div className="lw-ai-warning"><strong>Phần AI chưa đủ căn cứ</strong><ul>{assessment.analysis.limitations.map((value, index) => <li key={index}>{value}</li>)}</ul></div>}</div>
      <p className="lw-help">Giáo viên hỏi học sinh hoặc đối chiếu bài làm để xác minh giả thuyết. Xác nhận lỗi cần nguyên nhân do giáo viên kết luận và căn cứ cụ thể.</p>
      {!assessment.analysis.errors.length && <p>AI chưa chỉ ra lỗi có căn cứ. Giáo viên vẫn cần kiểm tra bài và nhận xét trước khi duyệt.</p>}
      {assessment.analysis.errors.map((item, index) => <article className="lw-ai-error-card" key={item.id}>
        <div className="lw-ai-heading"><h4>{index + 1}. {item.title}</h4><span className="lw-ai-status">{item.skill}</span></div>
        <dl><dt>Bằng chứng trong bài</dt><dd>{item.evidence}</dd><dt>Giả thuyết nguyên nhân</dt><dd>{item.hypothesis} <small>(AI tự ước lượng mức tin cậy: {item.confidence === 'high' ? 'cao' : item.confidence === 'medium' ? 'vừa' : 'thấp'})</small></dd><dt>Câu hỏi kiểm chứng</dt><dd>{item.verificationQuestion}</dd><dt>Hướng khắc phục</dt><dd>{item.remediation}</dd></dl>
        <label>Kết luận của giáo viên<select aria-label={`Kết luận lỗi ${index + 1}`} disabled={disabled || approved} value={item.decision} onChange={event => editError(item.id, { decision: event.target.value as WallLearningError['decision'] })}><option value="pending">Chưa kiểm chứng</option><option value="confirmed">Xác nhận lỗi và nguyên nhân</option><option value="rejected">Loại bỏ nhận định của AI</option></select></label>
        {item.decision === 'confirmed' && <><label>Nguyên nhân đã xác minh<textarea aria-label={`Nguyên nhân lỗi ${index + 1}`} rows={2} maxLength={1200} disabled={disabled || approved} value={item.teacherCause} onChange={event => editError(item.id, { teacherCause: event.target.value })} placeholder="Kết luận của giáo viên sau kiểm chứng…" /></label><label>Căn cứ kiểm chứng / câu trả lời của học sinh<textarea aria-label={`Căn cứ lỗi ${index + 1}`} rows={2} maxLength={1200} disabled={disabled || approved} value={item.verificationEvidence} onChange={event => editError(item.id, { verificationEvidence: event.target.value })} placeholder="Học sinh giải thích gì? Bước nào trong bài xác nhận nguyên nhân?" /></label></>}
      </article>)}
      <label>Mã học sinh để nối tiến bộ giữa các bài<input aria-label="Mã học sinh để theo dõi" maxLength={80} disabled={disabled || approved} value={assessment.studentCode} onChange={event => setAssessment({ ...assessment, studentCode: event.target.value.trim() })} placeholder="Ví dụ: 8A-012 (giáo viên xác minh)" /></label>
      <label>Nhận xét giáo viên sẽ duyệt<textarea aria-label="Nhận xét giáo viên sẽ duyệt" rows={4} maxLength={2000} disabled={disabled || approved} value={assessment.review.feedback} onChange={event => setAssessment({ ...assessment, review: { ...assessment.review, feedback: event.target.value } })} /></label>
      <label>Điểm do giáo viên quyết định / 10<input aria-label="Điểm giáo viên quyết định" type="number" min="0" max="10" step="0.25" disabled={disabled || approved} value={score} onChange={event => { setScore(event.target.value); setAssessment({ ...assessment, review: { ...assessment.review, score: event.target.value === '' ? null : Number(event.target.value) } }); }} /></label><p className="lw-help">Để trống sẽ giữ điểm hiện có. AI không tự đặt điểm. Nhận xét, điểm và kết luận nguyên nhân ở trong không gian riêng của giáo viên.</p>
      <div className="lw-row lw-ai-wrap">{!approved ? <><button type="button" className="lw-button" disabled={disabled || !dirty} onClick={() => void run(() => persist(assessment))}><Save size={16} />Lưu bản nháp</button><button type="button" className="lw-button lw-primary" disabled={disabled || !assessment.review.feedback.trim()} onClick={() => void run(async () => {
        const next = approvedWallAssessment(assessment, ownerUid, displayName, score); await persist(next, true);
      })}><ClipboardCheck size={17} />Duyệt nhận xét và lưu điểm</button></> : <><button type="button" className="lw-button" disabled={disabled} onClick={() => void run(async () => { await navigator.clipboard.writeText(studentWallFeedback(post, assessment)); if (mounted.current) setMessage('Đã sao chép nhận xét đã duyệt để gửi riêng cho học sinh.'); })}><Copy size={16} />Sao chép nhận xét đã duyệt</button><button type="button" className="lw-button" disabled={disabled} onClick={() => { setAssessment({ ...assessment, id: crypto.randomUUID(), practice: null, review: { ...assessment.review, status: 'draft', teacherUid: '', reviewedAt: 0 } }); resetTransfer(); }}>Chỉnh nhận xét thành bản mới</button></>}</div>
      {approved && <p className="lw-ai-success">{assessment.review.teacherName} đã duyệt lúc {new Date(assessment.review.reviewedAt).toLocaleString('vi-VN')}. Điểm: {assessment.review.score ?? 'Chưa đặt'}{assessment.review.score !== null ? '/10' : ''}.</p>}
    </div>)}

    {step === 2 && (!assessment || !approved ? <p className="lw-ai-empty">Giáo viên cần kiểm chứng và duyệt nhận xét trước khi tạo bài luyện tập.</p> : <div className="lw-ai-section">
      <p>{confirmed.length} lỗi đã xác nhận. AI tạo nhiệm vụ theo nguyên nhân do giáo viên kết luận, kèm gợi ý và tiêu chí kiểm tra.</p>
      {!confirmed.length && <p className="lw-ai-warning">Chưa có lỗi được xác nhận. Không tạo bài luyện tập dựa vào lỗi bị loại hoặc chưa kiểm chứng.</p>}
      {assessment.practice?.status !== 'assigned' && <div className="lw-row lw-ai-wrap">{source === 'firebase-gemini' ? <button type="button" className="lw-button lw-primary" disabled={disabled || dirty || !confirmed.length} onClick={() => void run(generatePractice)}><Sparkles size={17} />{assessment.practice ? 'Tạo lại luyện tập AI' : 'Tạo luyện tập cá nhân hóa'}</button> : <><button type="button" className="lw-button lw-primary" disabled={disabled || dirty || !confirmed.length} onClick={() => void run(() => prepareTransfer('practice'))}><Copy size={17} />Sao chép yêu cầu luyện tập</button><a className="lw-button" href={selectedSource.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} />Mở AI đang dùng</a></>}</div>}
      {transferPanel}
      {assessment.practice && <><label>Hướng dẫn học sinh<textarea maxLength={2000} rows={2} disabled={disabled || assessment.practice.status === 'assigned'} value={assessment.practice.instructions} onChange={event => setAssessment({ ...assessment, practice: { ...assessment.practice!, instructions: event.target.value } })} /></label>
        {assessment.practice.exercises.map((item, index) => <article key={item.id} className="lw-ai-error-card">
          <h4>Bài {index + 1} · {assessment.analysis.errors.find(error => error.id === item.errorId)?.skill} · {item.difficulty === 'foundation' ? 'Củng cố' : item.difficulty === 'application' ? 'Vận dụng' : 'Mở rộng'}</h4>
          <label>Đề luyện tập<textarea aria-label={`Đề luyện tập ${index + 1}`} maxLength={2000} rows={3} disabled={disabled || assessment.practice!.status === 'assigned'} value={item.question} onChange={event => editExercise(item.id, { question: event.target.value })} /></label>
          <label>Gợi ý cho học sinh<textarea maxLength={1200} rows={2} disabled={disabled || assessment.practice!.status === 'assigned'} value={item.hint} onChange={event => editExercise(item.id, { hint: event.target.value })} /></label>
          <details><summary>Đáp án và tiêu chí riêng của giáo viên</summary><label>Đáp án mẫu<textarea aria-label={`Đáp án luyện tập ${index + 1}`} maxLength={2000} rows={3} disabled={disabled || assessment.practice!.status === 'assigned'} value={item.expectedAnswer} onChange={event => editExercise(item.id, { expectedAnswer: event.target.value })} /></label><label>Tiêu chí khắc phục lỗi<textarea maxLength={1200} rows={2} disabled={disabled || assessment.practice!.status === 'assigned'} value={item.successCriteria} onChange={event => editExercise(item.id, { successCriteria: event.target.value })} /></label></details>
        </article>)}
        <div className="lw-row lw-ai-wrap">{assessment.practice.status === 'draft' ? <><button type="button" className="lw-button" disabled={disabled || !dirty} onClick={() => void run(() => persist(assessment))}><Save size={16} />Lưu luyện tập nháp</button><button type="button" className="lw-button lw-primary" disabled={disabled} onClick={() => void run(async () => { await persist(assignWallPractice(assessment)); })}><Check size={17} />Duyệt và giao luyện tập</button></> : <><button type="button" className="lw-button lw-primary" disabled={disabled} onClick={() => downloadWallText(studentWallWorksheet(post, assessment), `Luyen_tap_${post.id}.txt`)}><Download size={17} />Tải phiếu cho học sinh</button><button type="button" className="lw-button" disabled={disabled} onClick={() => void run(async () => { await navigator.clipboard.writeText(studentWallWorksheet(post, assessment)); if (mounted.current) setMessage('Đã sao chép phiếu luyện tập, không kèm đáp án mẫu hoặc nhận định riêng.'); })}><Copy size={16} />Sao chép phiếu luyện tập</button><button type="button" className="lw-button" onClick={() => setStep(3)}><TrendingUp size={17} />Ghi nhận tiến bộ</button></>}</div>
        <p className="lw-help">“Giao luyện tập” lưu phiên bản giáo viên đã duyệt. Tải/sao chép phiếu và gửi riêng cho học sinh; học sinh làm bài rồi nộp lại trên tường hoặc gửi giáo viên. Đáp án mẫu được giữ riêng.</p>
      </>}
    </div>)}

    {step === 3 && <div className="lw-ai-section">
      {assessment?.practice?.status === 'assigned' && !stale && <form onSubmit={event => { event.preventDefault(); if (!verdict) { setError('Chọn kết quả do giáo viên đánh giá.'); return; } void run(async () => {
        if (!assessment || dirty) throw new Error('Lưu thay đổi trước khi ghi tiến bộ.');
        const next = recordWallPracticeAttempt(assessment, exerciseId, response, evidence, verdict, ownerUid);
        await persist(next); if (mounted.current) { setResponse(''); setEvidence(''); setVerdict(''); }
      }); }} className="lw-ai-attempt-form">
        <h4>Giáo viên kiểm tra lần luyện tập</h4><label>Bài luyện tập đã làm<select aria-label="Bài luyện tập đã làm" required disabled={disabled} value={exerciseId} onChange={event => setExerciseId(event.target.value)}><option value="">Chọn bài để đánh giá…</option>{assessment.practice.exercises.map((item, index) => <option key={item.id} value={item.id}>Bài {index + 1} · {assessment.analysis.errors.find(error => error.id === item.errorId)?.skill}</option>)}</select></label>
        {exercise && <p className="lw-help">Tiêu chí: {exercise.successCriteria}</p>}
        <label>Bài làm luyện tập của học sinh<textarea aria-label="Bài làm luyện tập của học sinh" required maxLength={4000} rows={3} disabled={disabled} value={response} onChange={event => setResponse(event.target.value)} placeholder="Dán bài học sinh nộp lại hoặc mô tả bước em đã thực hiện…" /></label>
        <label>Căn cứ đánh giá tiến bộ<textarea aria-label="Căn cứ đánh giá tiến bộ" required maxLength={2000} rows={2} disabled={disabled} value={evidence} onChange={event => setEvidence(event.target.value)} placeholder="Đối chiếu tiêu chí: bước nào đã đúng, còn sai ở đâu?" /></label>
        <label>Kết quả giáo viên đánh giá<select aria-label="Kết quả giáo viên đánh giá" required disabled={disabled} value={verdict} onChange={event => setVerdict(event.target.value as PracticeVerdict)}><option value="">Chọn kết quả…</option>{Object.entries(VERDICT_LABELS).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><button type="submit" className="lw-button lw-primary" disabled={disabled || !exerciseId || !verdict}><Save size={17} />Lưu lần luyện tập</button>
      </form>}
      <WallAiProgress compact posts={assessment ? posts.filter(item => item.id === post.id || (Boolean(assessment.studentCode) && item.aiAssessment?.studentCode === assessment.studentCode)).map(item => item.id === post.id ? { ...post, aiAssessment: dirty ? post.aiAssessment : assessment } : item) : [post]} />
      {Boolean(assessment?.practice?.attempts.length) && <details open><summary>Lịch sử bài luyện tập này ({assessment!.practice!.attempts.length} lượt)</summary><div className="lw-ai-history">{[...assessment!.practice!.attempts].reverse().map(item => <article key={item.id}><strong>{item.exerciseId} · {VERDICT_LABELS[item.verdict]}</strong><small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small><p>Bài làm: {item.response}</p><p>Căn cứ: {item.evidence}</p></article>)}</div></details>}
      {Boolean(post.aiAssessmentHistory?.length) && <details><summary>Lịch sử nhận xét đã duyệt ({post.aiAssessmentHistory!.length} phiên bản)</summary><div className="lw-ai-history">{[...post.aiAssessmentHistory!].reverse().map(item => <article key={item.id}><strong>{item.review.teacherName} · {new Date(item.review.reviewedAt).toLocaleString('vi-VN')}</strong><p>{item.review.feedback}</p><small>{item.practice?.attempts.length || 0} lượt luyện tập đã kiểm tra</small></article>)}</div></details>}
    </div>}
  </section>;
}
