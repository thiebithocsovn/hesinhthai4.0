import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExtension from '@tiptap/extension-underline';
import SubscriptExtension from '@tiptap/extension-subscript';
import SuperscriptExtension from '@tiptap/extension-superscript';
import {
  Bold, Check, CheckCircle2, ClipboardPaste, Copy, Eraser, ExternalLink,
  FileUp, Film, FlaskConical, Image as ImageIcon, Italic, Library, Link2,
  LoaderCircle, Mic, Music2, Pause, Play, Plus, Redo2, Save, Scissors,
  Search, Sigma, Square, Strikethrough, Subscript, Superscript, Trash2,
  Underline, Undo2, Upload, Volume2, X, Youtube,
} from 'lucide-react';
import type { PlickerAnswer } from '../lib/plickerVision';
import type { PlickerLiveQuestion, PlickerLiveQuestionSet } from '../lib/plickerLive';
import {
  formatPlickerScore,
  normalizePlickerQuestionPoints,
  PLICKER_DEFAULT_QUESTION_POINTS,
  PLICKER_MAX_QUESTION_POINTS,
  sumPlickerScores,
} from '../lib/plickerScoring';
import {
  createPlickerSoundEffectDataUrl,
  createPlickerYoutubeEmbedUrl,
  extractPlickerYoutubeId,
  formatPlickerMediaTime,
  isPlickerMediaUrl,
  PLICKER_MAX_INLINE_MEDIA_BYTES,
  PLICKER_MAX_MEDIA_PER_QUESTION,
  PLICKER_SOUND_LIBRARY,
  sanitizePlickerQuestionMedia,
  sanitizePlickerRichHtml,
  type PlickerQuestionMedia,
  type PlickerQuestionMediaKind,
} from '../lib/plickerQuestionMedia';
import PlickerQuestionMediaGallery from './PlickerQuestionContent';
import { PlickerFractionExtension } from './PlickerFraction';

const ANSWERS: PlickerAnswer[] = ['A', 'B', 'C', 'D'];
const SYMBOL_GROUPS = [
  { title: 'Toán học', items: ['±', '×', '÷', '≠', '≈', '≤', '≥', '∞', '√', '∑', '∫', 'π', '°', '△', '∠', '⊥', '∥', '∈', '∉', '⊂'] },
  { title: 'Chữ Hy Lạp', items: ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'ρ', 'σ', 'φ', 'ω', 'Δ', 'Ω'] },
  { title: 'Hóa học và mũi tên', items: ['→', '←', '⇌', '⇄', '↑', '↓', '⟶', '⚗', '℃', 'ℓ', 'mol', 'pH'] },
  { title: 'Biểu tượng', items: ['✓', '✗', '★', '♥', '☀', '☁', '♻', '🌱', '🌍', '🧪', '🔬', '📐', '🎵', '😀'] },
] as const;

const FORMULA_PRESETS = [
  { label: 'x²', html: 'x<sup>2</sup>', title: 'Bình phương' },
  { label: 'xⁿ', html: 'x<sup>n</sup>', title: 'Lũy thừa' },
  { label: 'a/b', html: '', title: 'Phân số' },
  { label: '√x', html: '√x', title: 'Căn bậc hai' },
  { label: 'H₂O', html: 'H<sub>2</sub>O', title: 'Phân tử nước' },
  { label: 'CO₂', html: 'CO<sub>2</sub>', title: 'Khí carbon dioxide' },
  { label: 'H₂SO₄', html: 'H<sub>2</sub>SO<sub>4</sub>', title: 'Axit sulfuric' },
  { label: 'SO₄²⁻', html: 'SO<sub>4</sub><sup>2−</sup>', title: 'Ion sulfate' },
  { label: 'Ca(OH)₂', html: 'Ca(OH)<sub>2</sub>', title: 'Calcium hydroxide' },
  { label: 'Fe³⁺', html: 'Fe<sup>3+</sup>', title: 'Ion sắt III' },
] as const;

export interface PlickerEditorQuestion extends PlickerLiveQuestion {
  type?: 'multiple_choice' | 'true_false';
  gradingType?: 'graded' | 'survey';
}

export interface PlickerEditorQuestionSet extends PlickerLiveQuestionSet {
  questions: PlickerEditorQuestion[];
}

interface PlickerQuestionEditorProps {
  questionSet: PlickerEditorQuestionSet;
  ownerUid: string;
  onChange: (questionSet: PlickerEditorQuestionSet) => void;
  onSave: () => void;
  onCancel: () => void;
  onImportPaste: () => void;
  onImportWord: () => void;
  onNotice?: (message: string) => void;
}

function escapePlickerHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\n', '<br>');
}

function EditorField({
  text,
  richText,
  placeholder,
  prominent = false,
  onChange,
  onActivate,
}: {
  text: string;
  richText?: string;
  placeholder: string;
  prominent?: boolean;
  onChange: (text: string, richText: string) => void;
  onActivate: (editor: Editor) => void;
}) {
  const initialContent = sanitizePlickerRichHtml(richText) || `<p>${escapePlickerHtml(text)}</p>`;
  const editor = useEditor({
    extensions: [StarterKit, UnderlineExtension, SubscriptExtension, SuperscriptExtension, PlickerFractionExtension],
    content: initialContent,
    onCreate: ({ editor }) => {
      if (prominent) onActivate(editor);
    },
    onFocus: ({ editor }) => onActivate(editor),
    onUpdate: ({ editor }) => {
      onChange(editor.getText({ blockSeparator: '\n' }).trim(), sanitizePlickerRichHtml(editor.getHTML()));
    },
    editorProps: {
      attributes: {
        class: prominent
          ? 'min-h-[190px] w-full text-[clamp(1.45rem,3.4vw,2.55rem)] font-bold leading-[1.3] tracking-tight text-slate-800 outline-none [&_p]:my-0 [&_sub]:text-[0.72em] [&_sup]:text-[0.72em]'
          : 'min-h-[42px] w-full text-[clamp(1.08rem,2vw,1.55rem)] font-semibold leading-[1.35] text-slate-700 outline-none [&_p]:my-0 [&_sub]:text-[0.72em] [&_sup]:text-[0.72em]',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = sanitizePlickerRichHtml(richText) || `<p>${escapePlickerHtml(text)}</p>`;
    if (next !== editor.getHTML() && text !== editor.getText({ blockSeparator: '\n' }).trim()) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, richText, text]);

  if (!editor) return null;

  return (
    <div className="relative min-w-0 flex-1">
      {!text && (
        <span className={`pointer-events-none absolute left-0 top-0 text-slate-300 ${
          prominent ? 'text-[clamp(1.45rem,3.4vw,2.55rem)] font-bold' : 'text-[clamp(1.08rem,2vw,1.55rem)] font-semibold'
        }`}>
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  title,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-sm transition-colors ${
        active ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
      } disabled:cursor-not-allowed disabled:opacity-35`}
    >
      {children}
    </button>
  );
}

function createAttachmentId(): string {
  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được tệp đã chọn.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function compressQuestionImage(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const current = new window.Image();
      current.onload = () => resolve(current);
      current.onerror = () => reject(new Error('Không đọc được hình ảnh.'));
      current.src = objectUrl;
    });
    const scale = Math.min(1, 1440 / image.width, 1080 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.8, 0.65, 0.5, 0.36]) {
      const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (compressed && compressed.size <= PLICKER_MAX_INLINE_MEDIA_BYTES) return compressed;
    }
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function storeQuestionMediaFile(file: File, kind: Exclude<PlickerQuestionMediaKind, 'youtube'>, ownerUid: string): Promise<{ src: string; mimeType: string }> {
  if (file.size <= PLICKER_MAX_INLINE_MEDIA_BYTES) {
    return { src: await readFileAsDataUrl(file), mimeType: file.type || `${kind}/octet-stream` };
  }

  if (kind === 'image') {
    const compressed = await compressQuestionImage(file);
    if (compressed) return { src: await readFileAsDataUrl(compressed), mimeType: 'image/jpeg' };
  }

  if (!ownerUid) {
    throw new Error('Tệp có dung lượng lớn. Hãy đăng nhập rồi tải lên hoặc sử dụng đường dẫn trực tuyến.');
  }

  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/[^a-zA-Z0-9._-]/gu, '-').slice(-90);
    const target = ref(getStorage(), `plicker-media/${ownerUid}/${createAttachmentId()}-${safeName}`);
    await uploadBytes(target, file, { contentType: file.type || undefined });
    return { src: await getDownloadURL(target), mimeType: file.type || `${kind}/octet-stream` };
  } catch (error) {
    console.error('Không thể tải tệp đa phương tiện lên Firebase Storage:', error);
    throw new Error('Không tải được tệp dung lượng lớn. Hãy dùng liên kết trực tuyến, video YouTube hoặc chọn tệp nhỏ hơn.');
  }
}

export default function PlickerQuestionEditor({
  questionSet,
  ownerUid,
  onChange,
  onSave,
  onCancel,
  onImportPaste,
  onImportWord,
  onNotice,
}: PlickerQuestionEditorProps) {
  const [activeQuestionId, setActiveQuestionId] = useState(questionSet.questions[0]?.id || 1);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [mediaModal, setMediaModal] = useState<'image' | 'video' | 'youtube' | 'audio' | 'clip' | null>(null);
  const [audioTab, setAudioTab] = useState<'record' | 'library'>('record');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [soundSearch, setSoundSearch] = useState('');
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const [formulasOpen, setFormulasOpen] = useState(false);
  const [clipTarget, setClipTarget] = useState<PlickerQuestionMedia | null>(null);
  const [clipStart, setClipStart] = useState('0');
  const [clipEnd, setClipEnd] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

  const activeQuestion = useMemo(() =>
    questionSet.questions.find(question => question.id === activeQuestionId) || questionSet.questions[0] || null,
  [activeQuestionId, questionSet.questions]);

  useEffect(() => {
    if (questionSet.questions.length && !questionSet.questions.some(question => question.id === activeQuestionId)) {
      setActiveQuestionId(questionSet.questions[0].id);
    }
  }, [activeQuestionId, questionSet.questions]);

  useEffect(() => () => {
    if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const updateQuestion = (questionId: number, update: (question: PlickerEditorQuestion) => PlickerEditorQuestion) => {
    onChange({
      ...questionSet,
      questions: questionSet.questions.map(question => question.id === questionId ? update(question) : question),
    });
  };

  const insertMarkup = (markup: string) => {
    if (!activeEditor) return;
    activeEditor.chain().focus().insertContent(markup).run();
    setSymbolsOpen(false);
    setFormulasOpen(false);
  };

  const insertFraction = () => {
    if (!activeEditor) return;
    activeEditor.chain().focus().insertContent({
      type: 'plickerFraction',
      attrs: { numerator: '', denominator: '' },
    }).run();
    setSymbolsOpen(false);
    setFormulasOpen(false);
  };

  const openMedia = (kind: 'image' | 'video' | 'youtube' | 'audio') => {
    setMediaModal(kind);
    setMediaError('');
    setMediaTitle('');
    setMediaUrl('');
    if (kind === 'audio') setAudioTab('record');
  };

  const closeMedia = () => {
    if (recording) recorderRef.current?.stop();
    setMediaModal(null);
    setMediaError('');
    setMediaUrl('');
    setMediaTitle('');
    setClipTarget(null);
  };

  const addAttachment = (attachment: PlickerQuestionMedia) => {
    if (!activeQuestion) return false;
    const existing = sanitizePlickerQuestionMedia(activeQuestion.media);
    if (existing.length >= PLICKER_MAX_MEDIA_PER_QUESTION) {
      setMediaError(`Mỗi câu hỏi chỉ nên có tối đa ${PLICKER_MAX_MEDIA_PER_QUESTION} tệp đa phương tiện.`);
      return false;
    }
    const sanitized = sanitizePlickerQuestionMedia([...existing, attachment]);
    if (sanitized.length !== existing.length + 1) {
      setMediaError('Đường dẫn hoặc định dạng tệp chưa hợp lệ.');
      return false;
    }
    updateQuestion(activeQuestion.id, question => ({ ...question, media: sanitized }));
    onNotice?.(`Đã thêm ${attachment.title} vào câu hỏi.`);
    closeMedia();
    return true;
  };

  const attachFile = async (file: File, kind: Exclude<PlickerQuestionMediaKind, 'youtube'>) => {
    if (!file) return;
    setMediaBusy(true);
    setMediaError('');
    try {
      const stored = await storeQuestionMediaFile(file, kind, ownerUid);
      addAttachment({
        id: createAttachmentId(),
        kind,
        src: stored.src,
        title: mediaTitle.trim() || file.name,
        mimeType: stored.mimeType,
      });
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Không thể thêm tệp đã chọn.');
    } finally {
      setMediaBusy(false);
    }
  };

  const attachOnlineMedia = () => {
    if (!activeQuestion || !mediaModal || mediaModal === 'clip' || mediaModal === 'audio') return;
    if (mediaModal === 'youtube') {
      const embed = createPlickerYoutubeEmbedUrl(mediaUrl);
      if (!embed) {
        setMediaError('Hãy dán đường dẫn YouTube hợp lệ, ví dụ: https://www.youtube.com/watch?v=...');
        return;
      }
      addAttachment({ id: createAttachmentId(), kind: 'youtube', src: embed, title: mediaTitle.trim() || 'Video YouTube' });
      return;
    }
    if (!isPlickerMediaUrl(mediaUrl, mediaModal)) {
      setMediaError('Hãy nhập đường dẫn HTTPS trực tiếp đến tệp.');
      return;
    }
    addAttachment({
      id: createAttachmentId(),
      kind: mediaModal,
      src: mediaUrl.trim(),
      title: mediaTitle.trim() || (mediaModal === 'image' ? 'Hình ảnh trực tuyến' : 'Video trực tuyến'),
    });
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMediaError('Trình duyệt chưa hỗ trợ ghi âm. Hãy sử dụng Chrome hoặc tải tệp âm thanh có sẵn.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 48_000 });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
        stream.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        const type = recorder.mimeType || 'audio/webm';
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const audioFile = new File(chunks, `ghi-am-cau-hoi.${extension}`, { type: type.split(';')[0] });
        void attachFile(audioFile, 'audio');
      };
      recorder.start();
      setRecording(true);
      setMediaError('');
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 30_000);
    } catch (error) {
      setMediaError(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Micro chưa được cấp quyền. Hãy cho phép trình duyệt sử dụng micro.'
        : 'Không khởi động được micro để ghi âm.');
    }
  };

  const attachLibrarySound = (id: string) => {
    const effect = PLICKER_SOUND_LIBRARY.find(item => item.id === id);
    if (!effect) return;
    addAttachment({
      id: createAttachmentId(),
      kind: 'audio',
      src: createPlickerSoundEffectDataUrl(effect.id),
      title: effect.title,
      mimeType: 'audio/wav',
      libraryKey: effect.id,
      endSeconds: effect.duration,
    });
  };

  const previewLibrarySound = async (id: string) => {
    try {
      await new Audio(createPlickerSoundEffectDataUrl(id)).play();
    } catch {
      setMediaError('Trình duyệt chưa cho phép phát âm thanh xem trước.');
    }
  };

  const saveAudioClip = () => {
    if (!activeQuestion || !clipTarget) return;
    const start = Number.parseFloat(clipStart);
    const end = clipEnd.trim() ? Number.parseFloat(clipEnd) : undefined;
    if (!Number.isFinite(start) || start < 0 || (end !== undefined && (!Number.isFinite(end) || end <= start))) {
      setMediaError('Điểm kết thúc phải lớn hơn điểm bắt đầu.');
      return;
    }
    updateQuestion(activeQuestion.id, question => ({
      ...question,
      media: (question.media || []).map(item => item.id === clipTarget.id
        ? { ...item, startSeconds: start, ...(end !== undefined ? { endSeconds: end } : {}) }
        : item),
    }));
    closeMedia();
  };

  const addQuestion = () => {
    const nextId = Math.max(...questionSet.questions.map(question => question.id), 0) + 1;
    onChange({
      ...questionSet,
      questions: [...questionSet.questions, {
        id: nextId,
        text: '',
        type: 'multiple_choice',
        gradingType: 'graded',
        points: PLICKER_DEFAULT_QUESTION_POINTS,
        options: { A: '', B: '', C: '', D: '' },
        correctAnswer: null,
      }],
    });
    setActiveQuestionId(nextId);
  };

  const duplicateQuestion = () => {
    if (!activeQuestion) return;
    const nextId = Math.max(...questionSet.questions.map(question => question.id), 0) + 1;
    const clone = structuredClone(activeQuestion);
    clone.id = nextId;
    clone.media = clone.media?.map(item => ({ ...item, id: createAttachmentId() }));
    onChange({ ...questionSet, questions: [...questionSet.questions, clone] });
    setActiveQuestionId(nextId);
  };

  const deleteQuestion = () => {
    if (!activeQuestion || questionSet.questions.length <= 1) return;
    const next = questionSet.questions.filter(question => question.id !== activeQuestion.id);
    onChange({ ...questionSet, questions: next });
    setActiveQuestionId(next[0].id);
  };

  const filteredSounds = PLICKER_SOUND_LIBRARY.filter(sound =>
    `${sound.title} ${sound.category}`.toLowerCase().includes(soundSearch.trim().toLowerCase()));
  const youtubeId = mediaModal === 'youtube' ? extractPlickerYoutubeId(mediaUrl) : null;

  if (!activeQuestion) return null;

  return (
    <section aria-label="Trình soạn câu hỏi đa phương tiện" className="overflow-hidden rounded-2xl border border-slate-200 bg-[#f5f6f9] shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">Quay lại</button>
          <ToolbarButton title="Hoàn tác" disabled={!activeEditor?.can().undo()} onClick={() => activeEditor?.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Làm lại" disabled={!activeEditor?.can().redo()} onClick={() => activeEditor?.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
        </div>
        <input
          value={questionSet.title}
          onChange={event => onChange({ ...questionSet, title: event.target.value })}
          aria-label="Tên bộ câu hỏi"
          placeholder="Tên bộ câu hỏi"
          className="min-w-40 flex-1 bg-transparent px-3 py-2 text-center text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onImportPaste} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700"><ClipboardPaste className="h-4 w-4" />Dán câu hỏi</button>
          <button type="button" onClick={onImportWord} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-sm text-emerald-700"><FileUp className="h-4 w-4" />Nhập Word</button>
          <button type="button" onClick={onSave} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" />Lưu bộ câu hỏi</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton title="In đậm" active={Boolean(activeEditor?.isActive('bold'))} onClick={() => activeEditor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="In nghiêng" active={Boolean(activeEditor?.isActive('italic'))} onClick={() => activeEditor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Gạch chân" active={Boolean(activeEditor?.isActive('underline'))} onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Gạch ngang" active={Boolean(activeEditor?.isActive('strike'))} onClick={() => activeEditor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>
          <span className="mx-1 h-6 w-px bg-slate-200" />
          <ToolbarButton title="Chỉ số trên / số mũ" active={Boolean(activeEditor?.isActive('superscript'))} onClick={() => activeEditor?.chain().focus().toggleSuperscript().run()}><Superscript className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Chỉ số dưới / công thức hóa học" active={Boolean(activeEditor?.isActive('subscript'))} onClick={() => activeEditor?.chain().focus().toggleSubscript().run()}><Subscript className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Chèn phân số: tử số trên, mẫu số dưới" onClick={insertFraction}>
            <span aria-hidden="true" className="inline-flex w-5 flex-col items-center text-[10px] font-bold leading-[1.05]">
              <span className="w-full border-b border-current pb-px text-center">a</span>
              <span className="pt-px">b</span>
            </span>
          </ToolbarButton>
          <div className="relative">
            <ToolbarButton title="Công thức Toán và Hóa học" active={formulasOpen} onClick={() => { setFormulasOpen(!formulasOpen); setSymbolsOpen(false); }}><FlaskConical className="h-4 w-4" /></ToolbarButton>
            {formulasOpen && (
              <div className="absolute left-0 top-11 z-30 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Công thức Toán – Hóa học</h3>
                <div className="grid grid-cols-3 gap-2">
                  {FORMULA_PRESETS.map(formula => <button key={formula.label} type="button" title={formula.title} onMouseDown={event => event.preventDefault()} onClick={() => formula.title === 'Phân số' ? insertFraction() : insertMarkup(formula.html)} className="rounded-lg border border-slate-200 px-2 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">{formula.label}</button>)}
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <ToolbarButton title="Chèn ký hiệu và biểu tượng" active={symbolsOpen} onClick={() => { setSymbolsOpen(!symbolsOpen); setFormulasOpen(false); }}><Sigma className="h-4 w-4" /></ToolbarButton>
            {symbolsOpen && (
              <div className="absolute left-0 top-11 z-30 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                {SYMBOL_GROUPS.map(group => (
                  <div key={group.title} className="mb-3">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</h3>
                    <div className="flex flex-wrap gap-1">
                      {group.items.map(symbol => <button key={symbol} type="button" onMouseDown={event => event.preventDefault()} onClick={() => insertMarkup(escapePlickerHtml(symbol))} className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-lg hover:bg-indigo-50">{symbol}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton title="Xóa định dạng" onClick={() => activeEditor?.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></ToolbarButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => updateQuestion(activeQuestion.id, question => ({ ...question, gradingType: 'graded' }))} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeQuestion.gradingType !== 'survey' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>Chấm điểm</button>
          <button type="button" onClick={() => updateQuestion(activeQuestion.id, question => ({ ...question, gradingType: 'survey', correctAnswer: null }))} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${activeQuestion.gradingType === 'survey' ? 'bg-violet-50 text-violet-700' : 'text-slate-500'}`}>Khảo sát</button>
          <label className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${activeQuestion.gradingType === 'survey' ? 'border-slate-200 text-slate-400' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            Điểm câu
            <input
              aria-label="Điểm của câu hỏi"
              type="number"
              min="0"
              max={PLICKER_MAX_QUESTION_POINTS}
              step="0.25"
              inputMode="decimal"
              disabled={activeQuestion.gradingType === 'survey'}
              value={activeQuestion.gradingType === 'survey' ? 0 : normalizePlickerQuestionPoints(activeQuestion.points)}
              onChange={event => updateQuestion(activeQuestion.id, question => ({
                ...question,
                points: normalizePlickerQuestionPoints(event.target.value),
              }))}
              className="w-16 rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-center text-sm text-slate-800 outline-none focus:border-emerald-500 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </label>
          <ToolbarButton title="Nhân bản câu hỏi" onClick={duplicateQuestion}><Copy className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton title="Xóa câu hỏi" disabled={questionSet.questions.length <= 1} onClick={deleteQuestion}><Trash2 className="h-4 w-4 text-red-500" /></ToolbarButton>
        </div>
      </div>

      <div className="grid min-h-[660px] grid-cols-1 md:grid-cols-[176px_minmax(0,1fr)_64px]">
        <aside className="max-h-[760px] overflow-y-auto border-b border-slate-200 bg-[#f5f6f9] p-3 md:border-b-0 md:border-r">
          <div className="flex gap-2 overflow-x-auto md:block md:space-y-3">
            {questionSet.questions.map((question, index) => (
              <button key={question.id} type="button" onClick={() => setActiveQuestionId(question.id)} className={`relative min-w-36 rounded-xl border p-2 text-left transition-colors md:min-w-0 md:w-full ${activeQuestion?.id === question.id ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
                <span className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${activeQuestion?.id === question.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
                <div className="min-h-20 rounded-md bg-white p-2 pl-5">
                  <p className="line-clamp-2 text-[10px] font-semibold text-slate-700">{question.text || 'Câu hỏi mới'}</p>
                  <div className="mt-1 space-y-0.5">
                    {ANSWERS.filter(answer => question.options[answer] !== undefined).map(answer => <p key={answer} className="truncate text-[8px] text-slate-400"><strong>{answer}</strong> {question.options[answer] || '...'}</p>)}
                  </div>
                  <p className={`mt-1 text-[9px] font-semibold ${question.gradingType === 'survey' ? 'text-violet-500' : 'text-emerald-600'}`}>
                    {question.gradingType === 'survey' ? 'Khảo sát' : `${formatPlickerScore(normalizePlickerQuestionPoints(question.points))} điểm`}
                  </p>
                  {(question.media?.length || 0) > 0 && <p className="mt-1 text-[9px] text-indigo-500">{question.media?.length} tệp đính kèm</p>}
                </div>
              </button>
            ))}
            <button type="button" onClick={addQuestion} className="flex min-h-12 min-w-36 items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-white px-2 text-xs font-semibold text-indigo-600 hover:border-indigo-400 md:w-full md:min-w-0"><Plus className="h-4 w-4" />Thêm câu</button>
          </div>
        </aside>

        <main className="min-w-0 overflow-y-auto p-4 md:p-6 xl:p-8">
          <article className={`mx-auto flex min-h-[590px] max-w-4xl flex-col rounded-xl border bg-white p-5 shadow-sm md:p-8 ${activeQuestion.gradingType === 'survey' ? 'border-violet-200' : 'border-slate-200'}`}>
            {activeQuestion.gradingType === 'survey' && <div className="mb-4 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">Câu khảo sát — không chấm đáp án đúng/sai.</div>}
            <div className="flex min-h-64 flex-1 flex-col rounded-xl border border-transparent p-2 focus-within:border-indigo-200 md:p-3">
              <EditorField
                text={activeQuestion.text}
                richText={activeQuestion.richText}
                prominent
                placeholder="Nhấp vào đây để nhập câu hỏi..."
                onActivate={setActiveEditor}
                onChange={(text, richText) => updateQuestion(activeQuestion.id, question => ({ ...question, text, richText }))}
              />
              <PlickerQuestionMediaGallery
                media={activeQuestion.media}
                onRemove={mediaId => updateQuestion(activeQuestion.id, question => ({ ...question, media: (question.media || []).filter(item => item.id !== mediaId) }))}
                onClip={item => {
                  setClipTarget(item);
                  setClipStart(String(item.startSeconds || 0));
                  setClipEnd(item.endSeconds !== undefined ? String(item.endSeconds) : '');
                  setMediaModal('clip');
                  setMediaError('');
                }}
              />
            </div>

            <section aria-label="Các đáp án của câu hỏi" className="mt-8 space-y-4 border-t border-slate-100 pt-6">
              {ANSWERS.filter(answer => activeQuestion.options[answer] !== undefined).map(answer => (
                <div key={`${activeQuestion.id}-${answer}`} className="flex min-w-0 items-center gap-3 md:gap-4">
                  <button
                    type="button"
                    disabled={activeQuestion.gradingType === 'survey'}
                    onClick={() => updateQuestion(activeQuestion.id, question => ({ ...question, correctAnswer: question.correctAnswer === answer ? null : answer }))}
                    title={activeQuestion.correctAnswer === answer ? 'Bỏ chọn đáp án đúng' : `Chọn ${answer} là đáp án đúng`}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-xl font-bold ${activeQuestion.correctAnswer === answer ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-400'} disabled:cursor-not-allowed disabled:opacity-60`}
                  >{answer}</button>
                  <div className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 focus-within:border-indigo-200">
                    <EditorField
                      text={activeQuestion.options[answer] || ''}
                      richText={activeQuestion.optionRichText?.[answer]}
                      placeholder="Nhấp vào đây để nhập đáp án"
                      onActivate={setActiveEditor}
                      onChange={(text, richText) => updateQuestion(activeQuestion.id, question => ({
                        ...question,
                        options: { ...question.options, [answer]: text },
                        optionRichText: { ...question.optionRichText, [answer]: richText },
                      }))}
                    />
                  </div>
                  {activeQuestion.correctAnswer === answer && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
                </div>
              ))}
            </section>
          </article>
          <p className="mx-auto mt-4 max-w-4xl text-xs text-slate-500">Bấm A/B/C/D để chọn đáp án đúng. Chọn đoạn văn bản rồi dùng thanh công cụ để tạo số mũ, chỉ số dưới và định dạng.</p>
        </main>

        <aside aria-label="Thanh chèn đa phương tiện" className="flex items-center justify-center border-t border-slate-200 bg-white px-2 py-3 md:border-l md:border-t-0">
          <div className="flex gap-2 md:flex-col">
            <ToolbarButton title="Chèn hình ảnh hoặc GIF" onClick={() => openMedia('image')}><ImageIcon className="h-5 w-5" /></ToolbarButton>
            <ToolbarButton title="Chèn video" onClick={() => openMedia('video')}><Film className="h-5 w-5" /></ToolbarButton>
            <ToolbarButton title="Chèn video YouTube" onClick={() => openMedia('youtube')}><Youtube className="h-5 w-5 text-red-500" /></ToolbarButton>
            <ToolbarButton title="Chèn âm thanh hoặc ghi âm" onClick={() => openMedia('audio')}><Volume2 className="h-5 w-5" /></ToolbarButton>
            <ToolbarButton title="Thư viện âm thanh" onClick={() => { openMedia('audio'); setAudioTab('library'); }}><Library className="h-5 w-5" /></ToolbarButton>
            <ToolbarButton title="Thêm câu hỏi mới" onClick={addQuestion}><Plus className="h-5 w-5 text-indigo-600" /></ToolbarButton>
          </div>
        </aside>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <button
          type="button"
          onClick={() => updateQuestion(activeQuestion.id, question => question.type === 'true_false'
            ? { ...question, type: 'multiple_choice', options: { A: '', B: '', C: '', D: '' }, optionRichText: {}, correctAnswer: null }
            : { ...question, type: 'true_false', options: { A: 'Đúng', B: 'Sai' }, optionRichText: {}, correctAnswer: null })}
          className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700"
        >{activeQuestion.type === 'true_false' ? 'Chuyển sang trắc nghiệm A/B/C/D' : 'Chọn Đúng/Sai'}</button>
        <span>Câu {questionSet.questions.findIndex(question => question.id === activeQuestion.id) + 1}/{questionSet.questions.length} · Tổng điểm bộ câu hỏi: {formatPlickerScore(sumPlickerScores(questionSet.questions.map(question => question.gradingType === 'survey' ? 0 : normalizePlickerQuestionPoints(question.points))))} · {activeQuestion.media?.length || 0}/{PLICKER_MAX_MEDIA_PER_QUESTION} tệp đa phương tiện</span>
      </footer>

      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void attachFile(file, 'image'); event.currentTarget.value = ''; }} />
      <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,video/ogg" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void attachFile(file, 'video'); event.currentTarget.value = ''; }} />
      <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void attachFile(file, 'audio'); event.currentTarget.value = ''; }} />

      {mediaModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="plicker-media-dialog-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-7">
            <div className="flex items-center justify-between gap-3">
              <h2 id="plicker-media-dialog-title" className="text-lg font-bold text-slate-900">
                {mediaModal === 'image' ? 'Chèn hình ảnh hoặc GIF' : mediaModal === 'video' ? 'Chèn video' : mediaModal === 'youtube' ? 'Chèn video YouTube' : mediaModal === 'clip' ? 'Cắt đoạn âm thanh' : 'Âm thanh và ghi âm'}
              </h2>
              <button type="button" onClick={closeMedia} aria-label="Đóng cửa sổ đa phương tiện" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {(mediaModal === 'image' || mediaModal === 'video' || mediaModal === 'youtube') && (
              <div className="mt-6 space-y-4">
                <label className="block text-sm font-medium text-slate-700">Tên hiển thị<input value={mediaTitle} onChange={event => setMediaTitle(event.target.value)} placeholder={mediaModal === 'youtube' ? 'Ví dụ: Thí nghiệm Hóa học lớp 8' : mediaModal === 'image' ? 'Ví dụ: Hình minh họa' : 'Ví dụ: Video thí nghiệm'} className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-indigo-400" /></label>
                <label className="block text-sm font-medium text-slate-700">
                  {mediaModal === 'youtube' ? 'Dán đường dẫn hoặc mã video YouTube' : 'Đường dẫn trực tuyến HTTPS'}
                  <div className="mt-2 flex gap-2"><div className="relative min-w-0 flex-1"><Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={mediaUrl} onChange={event => { setMediaUrl(event.target.value); setMediaError(''); }} placeholder={mediaModal === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://...'} className="block w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 outline-none focus:border-indigo-400" /></div><button type="button" onClick={attachOnlineMedia} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Chèn</button></div>
                </label>
                {youtubeId && <div className="overflow-hidden rounded-xl border border-slate-200"><iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId}`} title="Xem trước video YouTube" className="aspect-video w-full" allowFullScreen /></div>}
                {mediaModal === 'youtube' && <button type="button" onClick={() => window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(mediaTitle || mediaUrl || 'bài giảng')}`, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600"><Youtube className="h-4 w-4" />Tìm video trên YouTube<ExternalLink className="h-3.5 w-3.5" /></button>}
                {mediaModal !== 'youtube' && <button type="button" disabled={mediaBusy} onClick={() => (mediaModal === 'image' ? imageInputRef.current : videoInputRef.current)?.click()} className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm font-semibold text-slate-700 hover:border-indigo-300 disabled:opacity-50">{mediaBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5 text-indigo-500" />}{mediaModal === 'image' ? 'Tải hình ảnh/GIF từ máy tính hoặc điện thoại' : 'Tải tệp video từ máy tính hoặc điện thoại'}</button>}
              </div>
            )}

            {mediaModal === 'audio' && (
              <div className="mt-5 space-y-4">
                <div className="flex gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setAudioTab('record')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${audioTab === 'record' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Mic className="mr-2 inline h-4 w-4" />Ghi âm / tải tệp</button><button type="button" onClick={() => setAudioTab('library')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${audioTab === 'library' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}><Library className="mr-2 inline h-4 w-4" />Thư viện âm thanh</button></div>
                {audioTab === 'record' ? (
                  <>
                    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl bg-indigo-50 px-5 py-7 text-center">
                      <button type="button" onClick={() => void toggleRecording()} className={`flex h-24 w-24 items-center justify-center rounded-full transition-colors ${recording ? 'animate-pulse bg-red-500 text-white' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}>{recording ? <Square className="h-10 w-10 fill-current" /> : <Mic className="h-11 w-11" />}</button>
                      <p className="mt-4 text-sm font-semibold text-slate-700">{recording ? 'Đang ghi âm — nhấn để dừng' : 'Nhấn để ghi âm bằng micro'}</p>
                      <p className="mt-1 text-xs text-slate-500">Tối đa 30 giây cho mỗi đoạn ghi âm.</p>
                    </div>
                    <button type="button" disabled={mediaBusy || recording} onClick={() => audioInputRef.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">{mediaBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Tải tệp âm thanh MP3, WAV, OGG, M4A...</button>
                  </>
                ) : (
                  <>
                    <label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={soundSearch} onChange={event => setSoundSearch(event.target.value)} placeholder="Tìm hiệu ứng âm thanh..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {filteredSounds.map(sound => <div key={sound.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><button type="button" onClick={() => void previewLibrarySound(sound.id)} title={`Nghe thử ${sound.title}`} className="rounded-full bg-indigo-50 p-2 text-indigo-600"><Play className="h-4 w-4 fill-current" /></button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{sound.title}</p><p className="text-xs text-slate-500">{sound.category} · {formatPlickerMediaTime(sound.duration)}</p></div><button type="button" onClick={() => attachLibrarySound(sound.id)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">Chọn</button></div>)}
                      {filteredSounds.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Không tìm thấy âm thanh phù hợp.</p>}
                    </div>
                  </>
                )}
              </div>
            )}

            {mediaModal === 'clip' && clipTarget && (
              <div className="mt-6 space-y-4">
                <p className="text-sm text-slate-600">Chọn phần âm thanh muốn phát trong câu hỏi: <strong>{clipTarget.title}</strong>.</p>
                <audio src={clipTarget.src} controls preload="metadata" className="w-full" />
                <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium text-slate-700">Bắt đầu, giây<input type="number" min="0" step="0.1" value={clipStart} onChange={event => setClipStart(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">Kết thúc, giây<input type="number" min="0" step="0.1" value={clipEnd} onChange={event => setClipEnd(event.target.value)} placeholder="Đến cuối tệp" className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2" /></label></div>
                <div className="flex justify-end"><button type="button" onClick={saveAudioClip} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Scissors className="h-4 w-4" />Lưu đoạn âm thanh</button></div>
              </div>
            )}

            {mediaError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mediaError}</p>}
          </section>
        </div>
      )}
    </section>
  );
}
