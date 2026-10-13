import { ArrowDown, ArrowUp, Check, Image as ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  QUESTION_TYPE_LABELS,
  type QuestionDefinition,
  type QuestionResponse,
} from '../lib/questionEngine';

interface QuestionEngineStudentQuestionProps {
  question: QuestionDefinition;
  answer: QuestionResponse;
  onChange: (answer: QuestionResponse) => void;
}

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function QuestionEngineStudentQuestion({ question, answer, onChange }: QuestionEngineStudentQuestionProps) {
  const payload = question.payload;

  if (payload.type === 'single_choice') {
    return (
      <div className="space-y-3">
        {payload.options.map(option => {
          const selected = answer === option.id;
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="radio" checked={selected} onChange={() => onChange(option.id)} className="mt-0.5 h-5 w-5 text-blue-600" />
              <span className="text-slate-700">{option.text}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (payload.type === 'multiple_choice') {
    const selected = Array.isArray(answer) ? answer.map(String) : [];
    return (
      <div className="space-y-3">
        {payload.options.map(option => {
          const checked = selected.includes(option.id);
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter(id => id !== option.id) : [...selected, option.id])}
                className="mt-0.5 h-5 w-5 rounded text-blue-600"
              />
              <span className="text-slate-700">{option.text}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (payload.type === 'true_false') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map(value => (
          <button
            type="button"
            key={String(value)}
            onClick={() => onChange(value)}
            className={`rounded-xl border px-4 py-4 text-base font-bold transition ${answer === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {value ? 'Đúng' : 'Sai'}
          </button>
        ))}
      </div>
    );
  }

  if (payload.type === 'true_false_matrix') {
    const previous = Array.isArray(answer) ? answer as unknown[] : [];
    const values = payload.statements.map((_, index) => typeof previous[index] === 'boolean' ? previous[index] as boolean : null);
    return (
      <div className="space-y-3">
        {payload.statements.map((statement, index) => (
          <div key={statement.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 font-medium text-slate-800">{String.fromCharCode(97 + index)}. {statement.text}</div>
            <div className="flex gap-2">
              {[true, false].map(value => (
                <button
                  type="button"
                  key={String(value)}
                  onClick={() => {
                    const next = [...values];
                    next[index] = value;
                    onChange(next as boolean[]);
                  }}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${values[index] === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}
                >
                  {value ? 'Đúng' : 'Sai'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (payload.type === 'short_answer') {
    return <input className={inputClass} value={typeof answer === 'string' ? answer : ''} onChange={event => onChange(event.target.value)} placeholder="Nhập câu trả lời..." />;
  }

  if (payload.type === 'fill_blank') {
    const previous = Array.isArray(answer) ? answer : [];
    const values = payload.answers.map((_, index) => previous[index] === undefined || previous[index] === null ? '' : String(previous[index]));
    return (
      <div className="space-y-3">
        {payload.answers.map((_, index) => (
          <label key={index} className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">Chỗ trống {index + 1}</span>
            <input
              className={inputClass}
              value={values[index]}
              onChange={event => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              placeholder={`Nhập đáp án cho chỗ trống ${index + 1}`}
            />
          </label>
        ))}
      </div>
    );
  }

  if (payload.type === 'matching') {
    const values = answer && typeof answer === 'object' && !Array.isArray(answer) && !('x' in answer)
      ? answer as Record<string, string>
      : {};
    const rightOptions = [...payload.pairs].reverse();
    return (
      <div className="space-y-3">
        {payload.pairs.map((pair, index) => (
          <div key={pair.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr] md:items-center">
            <div className="font-medium text-slate-700">{index + 1}. {pair.left}</div>
            <select className={inputClass} value={values[pair.id] || ''} onChange={event => onChange({ ...values, [pair.id]: event.target.value })}>
              <option value="">-- Chọn nội dung ghép --</option>
              {rightOptions.map(item => <option key={item.id} value={item.right}>{item.right}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  if (payload.type === 'ordering') {
    return <OrderingQuestion question={question} answer={answer} onChange={onChange} />;
  }

  if (payload.type === 'classification') {
    const values = answer && typeof answer === 'object' && !Array.isArray(answer) && !('x' in answer)
      ? answer as Record<string, string>
      : {};
    return (
      <div className="space-y-3">
        {payload.items.map(item => (
          <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_220px] md:items-center">
            <span className="font-medium text-slate-700">{item.text}</span>
            <select className={inputClass} value={values[item.id] || ''} onChange={event => onChange({ ...values, [item.id]: event.target.value })}>
              <option value="">-- Chọn nhóm --</option>
              {payload.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  if (payload.type === 'image_hotspot') {
    const point = answer && typeof answer === 'object' && !Array.isArray(answer) && 'x' in answer && 'y' in answer
      ? answer as { x: number; y: number }
      : null;
    return (
      <div className="space-y-3">
        <button
          type="button"
          className="relative block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            onChange({
              x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
              y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10,
            });
          }}
        >
          {payload.imageUrl ? (
            <img src={payload.imageUrl} alt="Hình câu hỏi" className="max-h-[480px] w-full object-contain" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex min-h-48 items-center justify-center gap-2 text-slate-400"><ImageIcon className="h-5 w-5" /> Không có hình ảnh</span>
          )}
          {point && <span className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-blue-600 shadow" style={{ left: `${point.x}%`, top: `${point.y}%` }} />}
        </button>
        <p className="text-xs text-slate-500">Bấm trực tiếp vào vị trí mà em cho là đúng trên hình.</p>
      </div>
    );
  }

  return null;
}

function OrderingQuestion({ question, answer, onChange }: QuestionEngineStudentQuestionProps) {
  if (question.payload.type !== 'ordering') return null;
  const correctItems = question.payload.items;
  const initialOrder = useMemo(() => [...correctItems].reverse().map(item => item.id), [correctItems]);
  const answeredOrder = Array.isArray(answer) ? answer.map(String) : null;
  const [localOrder, setLocalOrder] = useState<string[]>(() => answeredOrder?.length ? answeredOrder : initialOrder);
  const itemsById = new Map(correctItems.map(item => [item.id, item]));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= localOrder.length) return;
    const next = [...localOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setLocalOrder(next);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
        Sắp xếp các mục theo đúng thứ tự bằng nút lên/xuống.
      </div>
      {localOrder.map((id, index) => (
        <div key={id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">{index + 1}</span>
          <span className="flex-1 font-medium text-slate-700">{itemsById.get(id)?.text || ''}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === localOrder.length - 1} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          </div>
        </div>
      ))}
      {answeredOrder?.length ? <div className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> Đã ghi nhận thứ tự.</div> : null}
    </div>
  );
}

export function questionTypeLabel(question: QuestionDefinition): string {
  return QUESTION_TYPE_LABELS[question.payload.type];
}
