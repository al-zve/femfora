import { useState } from 'react';
import type { Energy, ListId } from '../db';
import { addTask } from '../lib/actions';
import { addDays, shortDate } from '../lib/dates';
import { Sheet } from './Sheet';
import { BoltIcon } from './icons';

export function AddSheet({ today, defaultDate, onClose }: { today: string; defaultDate: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [subs, setSubs] = useState('');
  const [energy, setEnergy] = useState<Energy>(2);
  const [list, setList] = useState<ListId>('personal');
  const [date, setDate] = useState(defaultDate);
  const tomorrow = addDays(today, 1);
  const isOther = date !== today && date !== tomorrow;

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
        <span className="label">Нагрузка</span>
        <div className="grid3">
          {([1, 2, 3] as Energy[]).map((v) => (
            <button key={v} className="chip" aria-pressed={energy === v} aria-label={['', 'Лёгкая', 'Средняя', 'Тяжёлая'][v]} onClick={() => setEnergy(v)}>
              {Array.from({ length: v }, (_, i) => (
                <BoltIcon key={i} color="var(--bolt)" />
              ))}
            </button>
          ))}
        </div>
      </div>
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
