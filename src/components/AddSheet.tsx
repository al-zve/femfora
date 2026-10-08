import { useState } from 'react';
import type { Energy, ListId } from '../db';
import { addTask } from '../lib/actions';
import { DOW_SHORT, addDays, dowIdx, shortDate } from '../lib/dates';
import { bestDay, budgetFor, loadOn } from '../lib/plan';
import { usePlan } from '../lib/usePlan';
import { estimateEnergy } from '../lib/estimate';
import { Load } from './Bolts';
import { Sheet } from './Sheet';
import { BoltIcon } from './icons';

export function AddSheet({ today, defaultDate, onClose }: { today: string; defaultDate: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [subs, setSubs] = useState('');
  const [energy, setEnergy] = useState<Energy>(2);
  const [list, setList] = useState<ListId>('personal');
  const [date, setDate] = useState(defaultDate);
  const [hint, setHint] = useState('');
  const tomorrow = addDays(today, 1);
  const isOther = date !== today && date !== tomorrow;
  const plan = usePlan(today);
  const dayLoad = plan ? loadOn(plan, date) : 0;
  const dayBudget = plan ? budgetFor(plan, date) : 0;
  const over = !!plan && dayLoad + energy > dayBudget;
  const alt = over && plan ? bestDay(plan, energy, date < today ? today : date) : null;
  const label = (d: string) => (d === today ? 'сегодня' : d === tomorrow ? 'завтра' : `${DOW_SHORT[dowIdx(d)].toLowerCase()}, ${shortDate(d)}`);

  const submit = async () => {
    if (!title.trim()) return;
    await addTask({
      title,
      date,
      energy,
      list,
      subs: subs.split('\n').map((s) => s.trim()).filter(Boolean)
    });
    onClose();
  };

  return (
    <Sheet title="Новая задача" onClose={onClose}>
      <div className="field">
        <label htmlFor="add-title">Задача</label>
        <input
          id="add-title"
          className="input"
          autoFocus
          value={title}
          placeholder="Что нужно сделать? Время: @14:00"
          enterKeyHint="done"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="field">
        <label htmlFor="add-subs">Подзадачи, каждая с новой строки</label>
        <textarea id="add-subs" className="input" rows={3} value={subs} placeholder="Необязательно" onChange={(e) => setSubs(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">Когда</span>
        <div className="grid3">
          <button className="chip" aria-pressed={date === today} onClick={() => setDate(today)}>
            Сегодня
          </button>
          <button className="chip" aria-pressed={date === tomorrow} onClick={() => setDate(tomorrow)}>
            Завтра
          </button>
          <label className="chip" aria-pressed={isOther} style={{ position: 'relative', overflow: 'hidden' }}>
            {isOther ? shortDate(date) : 'Дата'}
            <input
              type="date"
              aria-label="Выбрать дату"
              min={today}
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
            />
          </label>
        </div>
      </div>
      <div className="field">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: -8 }}>
          <span className="label">Нагрузка</span>
          <button
            className="btn-text"
            disabled={!title.trim()}
            style={{ opacity: title.trim() ? 1 : 0.4 }}
            onClick={() => {
              const r = estimateEnergy(title, subs.split('\n').filter((x) => x.trim()).length);
              setEnergy(r.energy);
              setHint(r.reason);
            }}
          >
            Оценить
          </button>
        </div>
        <div className="grid3">
          {([1, 2, 3] as Energy[]).map((v) => (
            <button
              key={v}
              className="chip"
              aria-pressed={energy === v}
              aria-label={['', 'Лёгкая', 'Средняя', 'Тяжёлая'][v]}
              onClick={() => {
                setEnergy(v);
                setHint('');
              }}
            >
              {Array.from({ length: v }, (_, i) => (
                <BoltIcon key={i} color="var(--bolt)" />
              ))}
            </button>
          ))}
        </div>
        {hint && (
          <span className="caption drop" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            {hint}
          </span>
        )}
      </div>
      {over && (
        <div className="proposal drop" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
            {date === today ? 'Сегодня' : date === tomorrow ? 'Завтра' : `${dowIdx(date) === 1 ? 'Во' : 'В'} ${label(date)}`} в плане {dayLoad} из ~<Load n={dayBudget} size={12} />, с этой задачей будет перебор.
          </span>
          {alt && (
            <button className="btn btn-secondary" style={{ background: 'var(--surface)', height: 44, alignSelf: 'flex-start' }} onClick={() => setDate(alt)}>
              Поставить на {label(alt)}
            </button>
          )}
        </div>
      )}
      <div className="field">
        <span className="label">Список</span>
        <div className="grid2">
          <button className="chip" aria-pressed={list === 'work'} onClick={() => setList('work')}>
            Работа
          </button>
          <button className="chip" aria-pressed={list === 'personal'} onClick={() => setList('personal')}>
            Личное
          </button>
        </div>
      </div>
      <button className="btn btn-primary" style={{ height: 52 }} disabled={!title.trim()} onClick={submit}>
        Добавить
      </button>
    </Sheet>
  );
}
