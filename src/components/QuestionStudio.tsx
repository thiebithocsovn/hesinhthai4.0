import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, Image, ListChecks, Plus, Save, Trash2, X } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  createQuestionTemplate,
  validateQuestion,
  type ChoiceOption,
  type ClassificationGroup,
  type ClassificationItem,
  type MatchingPair,
  type QuestionDefinition,
  type QuestionType,
  type TrueFalseStatement,
} from '../lib/questionEngine';

interface QuestionBank {
  id: string;
  title: string;
  questions: QuestionDefinition[];
  updatedAt: string;
}

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function storageKey(ownerUid: string): string {
  return `question_studio_v1:${ownerUid || 'guest'}`;
}

function createBank(): QuestionBank {
  return {
    id: createId('bank'),
    title: 'Bộ câu hỏi mới',
    questions: [],
    updatedAt: new Date().toISOString(),
  };
}

function readBanks(ownerUid: string): QuestionBank[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(ownerUid)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fieldClass(): string {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
}

function ActionButton({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  );
}

export default function QuestionStudio() {
  const [ownerUid, setOwnerUid] = useState(() => auth.currentUser?.uid || 'guest');
  const [banks, setBanks] = useState<QuestionBank[]>(() => {
    const saved = readBanks(ownerUid);
    return saved.length ? saved : [createBank()];
  });
  const [activeBankId, setActiveBankId] = useState(() => banks[0]?.id || '');
  const [draft, setDraft] = useState<QuestionDefinition>(() => createQuestionTemplate('single_choice'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const activeBank = useMemo(() => banks.find(bank => bank.id === activeBankId) || banks[0], [banks, activeBankId]);

  useEffect(() => onAuthStateChanged(auth, user => {
    const nextOwnerUid = user?.uid || 'guest';
    if (nextOwnerUid === ownerUid) return;
    const saved = readBanks(nextOwnerUid);
    const nextBanks = saved.length ? saved : [createBank()];
    setOwnerUid(nextOwnerUid);
    setBanks(nextBanks);
    setActiveBankId(nextBanks[0]?.id || '');
    setEditingId(null);
    setDraft(createQuestionTemplate('single_choice'));
    setMessage(user ? 'Đã mở ngân hàng câu hỏi của tài khoản giáo viên.' : 'Đang sử dụng dữ liệu dùng thử trên thiết bị này.');
  }), [ownerUid]);

  useEffect(() => {
    localStorage.setItem(storageKey(ownerUid), JSON.stringify(banks));
  }, [banks, ownerUid]);

  const updateDraft = (next: QuestionDefinition) => {
    setDraft(next);
    setMessage('');
  };

  const changeType = (type: QuestionType) => {
    const next = createQuestionTemplate(type);
    next.prompt = draft.prompt;
    next.points = draft.points;
    updateDraft(next);
    setEditingId(null);
  };

  const saveQuestion = () => {
    const errors = validateQuestion(draft);
    if (errors.length) {
      setMessage(errors.join(' '));
      return;
    }
    if (!activeBank) return;

    setBanks(previous => previous.map(bank => {
      if (bank.id !== activeBank.id) return bank;
      const questions = editingId
        ? bank.questions.map(question => question.id === editingId ? draft : question)
        : [...bank.questions, draft];
      return { ...bank, questions, updatedAt: new Date().toISOString() };
    }));
    setMessage(editingId ? 'Đã cập nhật câu hỏi.' : 'Đã thêm câu hỏi vào bộ.');
    setEditingId(null);
    setDraft(createQuestionTemplate(draft.payload.type));
  };

  const editQuestion = (question: QuestionDefinition) => {
    setDraft(structuredClone(question));
    setEditingId(question.id);
    setMessage('Đang chỉnh sửa câu hỏi đã lưu.');
  };

  const deleteQuestion = (id: string) => {
    if (!activeBank) return;
    setBanks(previous => previous.map(bank => bank.id === activeBank.id
      ? { ...bank, questions: bank.questions.filter(question => question.id !== id), updatedAt: new Date().toISOString() }
      : bank));
    if (editingId === id) {
      setEditingId(null);
      setDraft(createQuestionTemplate(draft.payload.type));
    }
  };

  const duplicateQuestion = (question: QuestionDefinition) => {
    if (!activeBank) return;
    const duplicate = structuredClone(question);
    duplicate.id = createId('q');
    duplicate.prompt = `${duplicate.prompt} (bản sao)`;
    setBanks(previous => previous.map(bank => bank.id === activeBank.id
      ? { ...bank, questions: [...bank.questions, duplicate], updatedAt: new Date().toISOString() }
      : bank));
  };

  const addBank = () => {
    const bank = createBank();
    setBanks(previous => [...previous, bank]);
    setActiveBankId(bank.id);
  };

  const updateBankTitle = (title: string) => {
    if (!activeBank) return;
    setBanks(previous => previous.map(bank => bank.id === activeBank.id ? { ...bank, title, updatedAt: new Date().toISOString() } : bank));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50 lg:flex-row">
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-72 lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Question Engine</p>
              <h2 className="text-lg font-bold text-slate-900">Bộ câu hỏi</h2>
            </div>
            <button type="button" onClick={addBank} className="rounded-xl bg-indigo-600 p-2 text-white hover:bg-indigo-700" title="Tạo bộ câu hỏi">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {banks.map(bank => (
              <button
                type="button"
                key={bank.id}
                onClick={() => setActiveBankId(bank.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${bank.id === activeBank?.id ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 hover:bg-slate-50'}`}
              >
                <div className="truncate text-sm font-semibold text-slate-800">{bank.title}</div>
                <div className="mt-1 text-xs text-slate-500">{bank.questions.length} câu hỏi</div>
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-56 overflow-auto p-4 lg:max-h-[calc(100vh-250px)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Câu hỏi đã tạo</p>
          <div className="space-y-2">
            {activeBank?.questions.map((question, index) => (
              <button
                type="button"
                key={question.id}
                onClick={() => editQuestion(question)}
                className={`w-full rounded-xl border p-3 text-left transition ${editingId === question.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{index + 1}</span>
                  <span className="truncate text-[11px] font-semibold text-indigo-600">{QUESTION_TYPE_LABELS[question.payload.type]}</span>
                </div>
                <p className="line-clamp-2 text-xs font-medium text-slate-700">{question.prompt}</p>
              </button>
            ))}
            {!activeBank?.questions.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Chưa có câu hỏi.</p>}
          </div>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Tên bộ câu hỏi</label>
                <input value={activeBank?.title || ''} onChange={event => updateBankTitle(event.target.value)} className={fieldClass()} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Tổng số câu</label>
                <div className="flex h-[42px] items-center rounded-xl bg-slate-50 px-3 text-sm font-bold text-slate-700">{activeBank?.questions.length || 0} câu</div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Loại câu hỏi</label>
                  <div className="relative">
                    <select value={draft.payload.type} onChange={event => changeType(event.target.value as QuestionType)} className={`${fieldClass()} appearance-none pr-9`}>
                      {QUESTION_TYPES.map(type => <option key={type} value={type}>{QUESTION_TYPE_LABELS[type]}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">Điểm</label>
                  <input type="number" min="0.25" step="0.25" value={draft.points} onChange={event => updateDraft({ ...draft, points: Number(event.target.value) })} className={fieldClass()} />
                </div>
              </div>
            </div>

            <div className="space-y-5 p-4 md:p-6">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Nội dung câu hỏi</label>
                <textarea value={draft.prompt} onChange={event => updateDraft({ ...draft, prompt: event.target.value })} rows={3} className={`${fieldClass()} resize-y`} placeholder="Nhập nội dung câu hỏi..." />
              </div>

              <PayloadEditor question={draft} onChange={updateDraft} />

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Giải thích đáp án (không bắt buộc)</label>
                <textarea value={draft.explanation || ''} onChange={event => updateDraft({ ...draft, explanation: event.target.value })} rows={2} className={`${fieldClass()} resize-y`} placeholder="Giải thích để học sinh hiểu vì sao đáp án đúng..." />
              </div>

              {message && <div className={`rounded-xl px-4 py-3 text-sm ${message.startsWith('Đã') || message.startsWith('Đang') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{message}</div>}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex gap-1">
                  {editingId && activeBank && (
                    <>
                      <ActionButton onClick={() => duplicateQuestion(draft)}><Copy className="h-4 w-4" /> Nhân bản</ActionButton>
                      <ActionButton danger onClick={() => deleteQuestion(editingId)}><Trash2 className="h-4 w-4" /> Xóa</ActionButton>
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(createQuestionTemplate(draft.payload.type)); setMessage(''); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Hủy sửa</button>}
                  <button type="button" onClick={saveQuestion} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"><Save className="h-4 w-4" /> {editingId ? 'Cập nhật câu hỏi' : 'Thêm vào bộ câu hỏi'}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            <div className="flex gap-3">
              <ListChecks className="mt-0.5 h-5 w-5 shrink-0" />
              <p><strong>10 dạng dùng chung một Question Engine.</strong> Cấu trúc này cho phép tái sử dụng cùng bộ câu hỏi cho kiểm tra, trò chơi, trình chiếu, Plicker hoặc AI tạo đề mà không phải lưu mỗi ứng dụng một kiểu dữ liệu khác nhau.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PayloadEditor({ question, onChange }: { question: QuestionDefinition; onChange: (question: QuestionDefinition) => void }) {
  const payload = question.payload;
  const updatePayload = (next: QuestionDefinition['payload']) => onChange({ ...question, payload: next });

  if (payload.type === 'single_choice' || payload.type === 'multiple_choice') {
    const multiple = payload.type === 'multiple_choice';
    const updateOption = (index: number, patch: Partial<ChoiceOption>) => {
      const options = payload.options.map((option, optionIndex) => {
        if (optionIndex !== index) return multiple || !patch.correct ? option : { ...option, correct: false };
        return { ...option, ...patch };
      });
      updatePayload({ ...payload, options });
    };
    return (
      <EditorSection title="Các phương án">
        <div className="space-y-2">
          {payload.options.map((option, index) => (
            <div key={option.id} className="flex items-center gap-2">
              <button type="button" onClick={() => updateOption(index, { correct: !option.correct })} className={`flex h-9 w-9 shrink-0 items-center justify-center border ${multiple ? 'rounded-lg' : 'rounded-full'} ${option.correct ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent'}`}><Check className="h-4 w-4" /></button>
              <input value={option.text} onChange={event => updateOption(index, { text: event.target.value })} className={fieldClass()} />
              <button type="button" onClick={() => updatePayload({ ...payload, options: payload.options.filter(item => item.id !== option.id) })} className="p-2 text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => updatePayload({ ...payload, options: [...payload.options, { id: createId('o'), text: `Phương án ${payload.options.length + 1}` }] })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm phương án</button>
        </div>
      </EditorSection>
    );
  }

  if (payload.type === 'true_false') {
    return <EditorSection title="Đáp án đúng"><div className="flex gap-2">{[true, false].map(value => <button type="button" key={String(value)} onClick={() => updatePayload({ ...payload, correct: value })} className={`rounded-xl border px-5 py-2.5 text-sm font-semibold ${payload.correct === value ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>{value ? 'Đúng' : 'Sai'}</button>)}</div></EditorSection>;
  }

  if (payload.type === 'true_false_matrix') {
    const updateStatement = (index: number, patch: Partial<TrueFalseStatement>) => updatePayload({ ...payload, statements: payload.statements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
    return <EditorSection title="Các nhận định a, b, c, d"><div className="space-y-2">{payload.statements.map((statement, index) => <div key={statement.id} className="grid gap-2 sm:grid-cols-[1fr_120px_36px]"><input value={statement.text} onChange={event => updateStatement(index, { text: event.target.value })} className={fieldClass()} /><select value={String(statement.correct)} onChange={event => updateStatement(index, { correct: event.target.value === 'true' })} className={fieldClass()}><option value="true">Đúng</option><option value="false">Sai</option></select><button type="button" onClick={() => updatePayload({ ...payload, statements: payload.statements.filter(item => item.id !== statement.id) })} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => updatePayload({ ...payload, statements: [...payload.statements, { id: createId('s'), text: `Nhận định ${payload.statements.length + 1}`, correct: true }] })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm nhận định</button></div></EditorSection>;
  }

  if (payload.type === 'short_answer' || payload.type === 'fill_blank') {
    const values = payload.type === 'short_answer' ? payload.acceptedAnswers : payload.answers;
    return <EditorSection title={payload.type === 'short_answer' ? 'Các đáp án chấp nhận' : 'Đáp án theo thứ tự các chỗ trống'}><textarea value={values.join('\n')} onChange={event => updatePayload(payload.type === 'short_answer' ? { ...payload, acceptedAnswers: event.target.value.split('\n') } : { ...payload, answers: event.target.value.split('\n') })} rows={4} className={`${fieldClass()} resize-y`} placeholder="Mỗi dòng một đáp án" /><p className="mt-1.5 text-xs text-slate-400">Mỗi dòng tương ứng một đáp án. Hệ thống tự bỏ khoảng trắng thừa và mặc định không phân biệt hoa/thường.</p></EditorSection>;
  }

  if (payload.type === 'matching') {
    const updatePair = (index: number, patch: Partial<MatchingPair>) => updatePayload({ ...payload, pairs: payload.pairs.map((pair, pairIndex) => pairIndex === index ? { ...pair, ...patch } : pair) });
    return <EditorSection title="Các cặp ghép"><div className="space-y-2">{payload.pairs.map((pair, index) => <div key={pair.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_36px]"><input value={pair.left} onChange={event => updatePair(index, { left: event.target.value })} className={fieldClass()} placeholder="Cột A" /><input value={pair.right} onChange={event => updatePair(index, { right: event.target.value })} className={fieldClass()} placeholder="Cột B" /><button type="button" onClick={() => updatePayload({ ...payload, pairs: payload.pairs.filter(item => item.id !== pair.id) })} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => updatePayload({ ...payload, pairs: [...payload.pairs, { id: createId('p'), left: '', right: '' }] })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm cặp</button></div></EditorSection>;
  }

  if (payload.type === 'ordering') {
    return <EditorSection title="Thứ tự đúng"><div className="space-y-2">{payload.items.map((item, index) => <div key={item.id} className="flex items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span><input value={item.text} onChange={event => updatePayload({ ...payload, items: payload.items.map(current => current.id === item.id ? { ...current, text: event.target.value } : current) })} className={fieldClass()} /><button type="button" onClick={() => updatePayload({ ...payload, items: payload.items.filter(current => current.id !== item.id) })} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => updatePayload({ ...payload, items: [...payload.items, { id: createId('i'), text: `Bước ${payload.items.length + 1}` }] })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm bước</button></div></EditorSection>;
  }

  if (payload.type === 'classification') {
    const updateGroups = (groups: ClassificationGroup[]) => updatePayload({ ...payload, groups });
    const updateItems = (items: ClassificationItem[]) => updatePayload({ ...payload, items });
    return <div className="grid gap-4 md:grid-cols-2"><EditorSection title="Nhóm phân loại"><div className="space-y-2">{payload.groups.map(group => <div key={group.id} className="flex gap-2"><input value={group.name} onChange={event => updateGroups(payload.groups.map(current => current.id === group.id ? { ...current, name: event.target.value } : current))} className={fieldClass()} /><button type="button" onClick={() => updateGroups(payload.groups.filter(current => current.id !== group.id))} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => updateGroups([...payload.groups, { id: createId('g'), name: `Nhóm ${payload.groups.length + 1}` }])} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm nhóm</button></div></EditorSection><EditorSection title="Đối tượng"><div className="space-y-2">{payload.items.map(item => <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_130px_30px]"><input value={item.text} onChange={event => updateItems(payload.items.map(current => current.id === item.id ? { ...current, text: event.target.value } : current))} className={fieldClass()} /><select value={item.groupId} onChange={event => updateItems(payload.items.map(current => current.id === item.id ? { ...current, groupId: event.target.value } : current))} className={fieldClass()}>{payload.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" onClick={() => updateItems(payload.items.filter(current => current.id !== item.id))} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => updateItems([...payload.items, { id: createId('i'), text: '', groupId: payload.groups[0]?.id || '' }])} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /> Thêm đối tượng</button></div></EditorSection></div>;
  }

  if (payload.type === 'image_hotspot') {
    const hotspot = payload.hotspots[0] || { x: 50, y: 50, radius: 10 };
    const updateHotspot = (patch: Partial<typeof hotspot>) => updatePayload({ ...payload, hotspots: [{ ...hotspot, ...patch }] });
    return <EditorSection title="Hình ảnh và vùng đáp án đúng"><div className="space-y-3"><div className="relative"><Image className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={payload.imageUrl} onChange={event => updatePayload({ ...payload, imageUrl: event.target.value })} className={`${fieldClass()} pl-9`} placeholder="https://.../hinh-anh.jpg" /></div><div className="grid grid-cols-3 gap-2"><label className="text-xs text-slate-500">X (%)<input type="number" min="0" max="100" value={hotspot.x} onChange={event => updateHotspot({ x: Number(event.target.value) })} className={`${fieldClass()} mt-1`} /></label><label className="text-xs text-slate-500">Y (%)<input type="number" min="0" max="100" value={hotspot.y} onChange={event => updateHotspot({ y: Number(event.target.value) })} className={`${fieldClass()} mt-1`} /></label><label className="text-xs text-slate-500">Bán kính (%)<input type="number" min="1" max="50" value={hotspot.radius} onChange={event => updateHotspot({ radius: Number(event.target.value) })} className={`${fieldClass()} mt-1`} /></label></div>{payload.imageUrl && <button type="button" className="relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); updateHotspot({ x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10, y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10 }); }}><img src={payload.imageUrl} alt="Ảnh câu hỏi" className="max-h-80 w-full object-contain" referrerPolicy="no-referrer" /><span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 bg-emerald-400/20" style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, width: `${hotspot.radius * 2}%`, aspectRatio: '1' }} /></button>}<p className="text-xs text-slate-400">Bấm trực tiếp lên hình để đặt tâm vùng đáp án đúng.</p></div></EditorSection>;
  }

  return null;
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4"><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>{children}</section>;
}
