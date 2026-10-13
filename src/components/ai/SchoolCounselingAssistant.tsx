import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  ServerCog,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { getConfiguredApiServer, saveApiServer } from '../../lib/api';
import type { SchoolCounselingSource } from '../../lib/aiService';
import type { SchoolCounselingMessage } from '../../lib/schoolCounselor';

const GOOGLE_AI_MODEL = import.meta.env.VITE_GOOGLE_AI_MODEL?.trim() || 'gemini-3.1-flash-lite';

const COUNSELING_SOURCE_LABELS: Record<SchoolCounselingSource, string> = {
  'google-gemini': 'Google Gemini · Firebase AI',
  'private-server': 'Máy chủ AI riêng',
  'browser-ai': 'AI ngay trên thiết bị',
  'on-device': 'Tư vấn tích hợp trên thiết bị',
  'safety-support': 'Ưu tiên an toàn khẩn cấp',
};

export default function SchoolCounselingAssistant() {
  const [messages, setMessages] = useState<SchoolCounselingMessage[]>([
    { role: 'model', text: 'Xin chào! Tôi là trợ lý tư vấn học đường. Tôi có thể hỗ trợ về bắt nạt, bạo lực học đường, áp lực thi cử, cảm xúc hoặc các tình huống giữa gia đình và nhà trường.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverAddress, setServerAddress] = useState(() => getConfiguredApiServer());
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const [activeSource, setActiveSource] = useState<SchoolCounselingSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(previous => [...previous, { role: 'user', text: userMessage }]);
    setIsLoading(true);
    setError(null);
    try {
      // Firebase AI and the counseling engine are loaded only when a message is actually sent.
      const { requestSchoolCounseling } = await import('../../lib/aiService');
      const response = await requestSchoolCounseling(userMessage, messages);
      setActiveSource(response.source);
      setMessages(previous => [...previous, { role: 'model', text: response.text }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xử lý tình huống lúc này.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveServer = () => {
    try {
      const normalized = saveApiServer(serverAddress);
      setServerAddress(normalized);
      setServerMessage(normalized ? 'Đã lưu máy chủ AI riêng.' : 'Đã trở lại chế độ AI tự động.');
      setError(null);
    } catch (err) {
      setServerMessage('');
      setError(err instanceof Error ? err.message : 'Không thể lưu địa chỉ máy chủ AI.');
    }
  };

  return (
    <div className="flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setShowServerSettings(value => !value)} className="flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900">
            {serverAddress ? <ServerCog className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {serverAddress ? 'Máy chủ riêng · có AI dự phòng' : 'Google Gemini · tự động tối ưu'}
          </button>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            {activeSource ? COUNSELING_SOURCE_LABELS[activeSource] : 'Sẵn sàng hỗ trợ'}
          </span>
        </div>
        {showServerSettings && (
          <div className="mt-3 space-y-2">
            <p className="text-xs leading-5 text-slate-600">Mặc định ưu tiên Google Gemini ({GOOGLE_AI_MODEL}); máy chủ HTTPS riêng là tùy chọn nâng cao. Không nhập khóa API tại đây.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="url" value={serverAddress} onChange={event => setServerAddress(event.target.value)} placeholder="https://may-chu-ai.example.com" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" />
              <button type="button" onClick={handleSaveServer} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Lưu tùy chọn</button>
            </div>
            {serverMessage && <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />{serverMessage}</p>}
          </div>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
        {messages.map((message, index) => (
          <div key={index} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${message.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className={`max-w-[85%] rounded-2xl p-4 ${message.role === 'user' ? 'rounded-tr-none bg-indigo-600 text-white' : 'rounded-tl-none bg-slate-100 text-slate-800'}`}>
              {message.role === 'user' ? <div className="whitespace-pre-wrap">{message.text}</div> : <div className="prose prose-sm max-w-none prose-slate"><Markdown>{message.text}</Markdown></div>}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />AI đang phân tích...</div>}
        {error && <div className="flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 bg-slate-50 p-4">
        <div className="relative">
          <textarea value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} rows={2} placeholder="Nhập câu hỏi hoặc tình huống..." className="w-full resize-none rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-14 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          <button type="button" onClick={() => void handleSend()} disabled={!input.trim() || isLoading} className="absolute bottom-2 right-2 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-5 w-5" /></button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Không nhập họ tên, địa chỉ hoặc dữ liệu nhạy cảm của học sinh. Trường hợp nguy hiểm: gọi 111, 113 hoặc 115.</p>
      </div>
    </div>
  );
}
