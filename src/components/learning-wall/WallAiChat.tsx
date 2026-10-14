import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, LoaderCircle, ClipboardCheck, RotateCcw, Save } from 'lucide-react';
import type { WallPost } from '../../lib/learningWall';
import { createWallAiRequest, wallWorkRevision, type WallAssessmentContext } from '../../lib/learningWallAssessment';
import { appendWallChatExchange, wallChatContextKey, wallChatVersion, type WallChat } from '../../lib/learningWallChat';

interface Props {
  post: WallPost;
  context: WallAssessmentContext;
  includeMedia: boolean;
  offline: boolean;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onUseFeedback: (text: string) => void;
  onSave: (post: WallPost, chat: WallChat, expected: WallChat | null) => Promise<WallChat>;
}
const QUESTIONS = ['Chỉ ra lỗi trong bài', 'Gợi ý nhận xét cho học sinh', 'Hỏi để xác minh nguyên nhân'];

export default function WallAiChat({ post, context, includeMedia, offline, disabled, onBusy, onUseFeedback, onSave }: Props) {
  const [chat, setChat] = useState<WallChat | null>(post.aiChat || null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState('');
  const [unsaved, setUnsaved] = useState(false);
  const [stale, setStale] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const baseline = useRef(post.aiChat || null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const signature = JSON.stringify([post.title, post.text, post.studentName, post.imageSrc,
    (post.attachments || []).map(file => [file.kind, file.url]), context, includeMedia]);
  const currentScope = useRef(signature); currentScope.current = signature;
  const locked = disabled || busy || offline;
  const chatContext = { ...context, task: context.task.trim() || 'Giáo viên chưa cung cấp đề bài. Chỉ nhận xét phần nhìn thấy; nêu rõ thiếu đề hoặc tiêu chí và hỏi giáo viên bổ sung.' };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!chat) { setStale(false); return; }
    Promise.all([wallWorkRevision(post), wallChatContextKey(chatContext, includeMedia)]).then(([revision, key]) => {
      if (active) setStale(chat.workRevision !== revision || chat.contextKey !== key);
    }).catch(() => { if (active) setStale(true); });
    return () => { active = false; };
  }, [signature, chat?.workRevision, chat?.contextKey]);
  useEffect(() => {
    if (!running.current && !unsaved && wallChatVersion(post.aiChat || null) !== wallChatVersion(baseline.current)) {
      baseline.current = post.aiChat || null; setChat(baseline.current);
    }
  }, [post.aiChat, unsaved]);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [chat?.messages.length, pendingMessage]);

  async function save(next: WallChat) {
    const result = await onSave(post, next, baseline.current);
    if (!mounted.current) return;
    baseline.current = result; setChat(result); setUnsaved(false);
  }
  async function send() {
    const message = draft.trim();
    if (!message || locked || running.current) return;
    if (unsaved) { setError('Lưu cuộc trao đổi hoặc tải bản đã lưu trước khi gửi tiếp.'); return; }
    if (stale) { setError('Bài làm hoặc tiêu chí đã đổi. Bắt đầu cuộc trao đổi mới để AI đối chiếu đúng.'); return; }
    running.current = true; setBusy(true); onBusy(true); setError(''); setNotice(''); setPendingMessage(message);
    const scope = currentScope.current;
    try {
      const request = await createWallAiRequest(post, chatContext, includeMedia);
      const key = await wallChatContextKey(chatContext, includeMedia);
      if (chat && chat.messages.length >= 40) throw new Error('Đã đủ 20 lượt trao đổi. Hãy bắt đầu cuộc trao đổi mới.');
      const { chatAboutWallWork } = await import('../../lib/learningWallAi');
      const reply = await chatAboutWallWork(request, message, chat?.messages || []);
      if (!mounted.current || currentScope.current !== scope) return;
      const next = appendWallChatExchange(chat, request, key, message, reply, includeMedia);
      setChat(next); setUnsaved(true); setDraft('');
      await save(next);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa gửi được tin nhắn. Hãy thử lại.');
    } finally {
      running.current = false;
      if (mounted.current) { setPendingMessage(''); setBusy(false); onBusy(false); input.current?.focus(); }
    }
  }
  function reset() {
    setChat(null); setDraft(''); setStale(false); setUnsaved(false); setError('');
    setNotice('Cuộc trao đổi mới sẽ dùng bài làm và tiêu chí hiện tại. Cuộc trước được giữ trong lịch sử khi lưu câu trả lời mới.');
  }
  async function checkConnection() {
    if (locked || running.current) return;
    running.current = true; setBusy(true); onBusy(true); setError(''); setConnection('');
    try {
      const { checkWallAiConnection } = await import('../../lib/learningWallAi');
      const model = await checkWallAiConnection();
      if (mounted.current) setConnection(`Đã nhận phản hồi từ ${model}. API sẵn sàng cho chat và đánh giá tại đây.`);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Chưa kiểm tra được kết nối AI.');
    } finally {
      running.current = false;
      if (mounted.current) { setBusy(false); onBusy(false); }
    }
  }

  return <section className="lw-ai-chat" aria-label="Chat AI trong phần nhận xét">
    <div className="lw-ai-heading"><MessageSquare size={21} /><div><h4>Chat AI về bài làm này</h4><p>Trao đổi và nhận gợi ý ngay trong phần nhận xét</p></div><span className="lw-ai-status">Gemini · Firebase</span></div>
    <div className="lw-ai-chat-connection"><button type="button" className="lw-button" disabled={locked} onClick={() => void checkConnection()}>Kiểm tra kết nối AI</button>{connection && <p role="status" className="lw-ai-success">{connection}</p>}</div>
    <div ref={log} className="lw-ai-chat-log" role="log" aria-label="Cuộc trao đổi AI" aria-live="polite" aria-relevant="additions text" tabIndex={0}>
      {!chat?.messages.length && !pendingMessage && <p className="lw-ai-chat-empty">Hỏi AI về lỗi, bằng chứng, cách xác minh nguyên nhân hoặc cách nhận xét bài làm. Giáo viên kiểm tra và quyết định nhận xét, điểm cuối cùng.</p>}
      {chat?.messages.map(message => <article key={message.id} className={`lw-ai-chat-message is-${message.role}`}>
        <strong>{message.role === 'user' ? 'Giáo viên' : 'AI hỗ trợ'}</strong><p>{message.text}</p>
        {message.role === 'model' && message.feedback && <div className="lw-ai-chat-feedback"><small>Nhận xét đề xuất</small><p>{message.feedback}</p><button type="button" className="lw-button" disabled={locked || stale} onClick={() => {
          onUseFeedback(message.feedback); setNotice('Đã đưa gợi ý vào ô nhận xét của giáo viên bên dưới. Kiểm tra, chỉnh sửa rồi bấm Gửi nhận xét.');
        }}><ClipboardCheck size={15} />Đưa vào ô nhận xét</button></div>}
      </article>)}
      {pendingMessage && <article className="lw-ai-chat-message is-user"><strong>Giáo viên</strong><p>{pendingMessage}</p></article>}
      {busy && <p className="lw-ai-busy" role="status"><LoaderCircle size={16} className="lw-ai-spin" />{pendingMessage ? 'AI đang đọc bài và trả lời…' : 'Đang kiểm tra kết nối AI…'}</p>}
    </div>
    {stale && <p role="alert" className="lw-ai-warning">Bài làm hoặc tiêu chí đã đổi. Hãy bắt đầu cuộc trao đổi mới trước khi dùng gợi ý cũ.</p>}
    {error && <p role="alert" className="lw-inline-error">{error}</p>}
    {notice && <p role="status" className="lw-ai-success">{notice}</p>}
    <div className="lw-ai-chat-prompts">{QUESTIONS.map(question => <button type="button" key={question} disabled={locked || stale} onClick={() => { setDraft(question); input.current?.focus(); }}>{question}</button>)}</div>
    <form className="lw-ai-chat-compose" onSubmit={event => { event.preventDefault(); void send(); }}>
      <label>Nhắn AI về bài làm<textarea ref={input} aria-label="Nhắn AI về bài làm" rows={3} maxLength={3000} disabled={locked || stale} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ví dụ: Em sai ở bước nào? Hãy gợi ý nhận xét ngắn, có cách sửa…" onKeyDown={event => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
      }} /></label><button type="submit" className="lw-button lw-primary" disabled={locked || stale || !draft.trim()}><Send size={16} />Gửi cho AI</button>
    </form>
    <div className="lw-row lw-ai-wrap">{Boolean(chat?.messages.length) && <button type="button" className="lw-button" disabled={locked} onClick={reset}><RotateCcw size={15} />Bắt đầu trao đổi mới</button>}{unsaved && chat && <><button type="button" className="lw-button" disabled={locked} onClick={() => { void save(chat).catch(failure => setError(failure.message)); }}><Save size={15} />Lưu cuộc trao đổi</button><button type="button" className="lw-button" disabled={locked} onClick={() => { baseline.current = post.aiChat || null; setChat(baseline.current); setUnsaved(false); setError(''); }}>Tải bản đã lưu</button></>}</div>
    <p className="lw-help">Enter để gửi, Shift+Enter để xuống dòng. Chat và gợi ý được giữ riêng theo bài; AI không tự gửi nhận xét hoặc đặt điểm.</p>
  </section>;
}
