import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, uid, type Energy, type ListId, type Task } from '../db';
import { deleteTask, moveTask, updateTask } from '../lib/actions';
import { addDays, shortDate } from '../lib/dates';
import { Sheet } from './Sheet';
import { subtasksBump } from '../lib/estimate';
import { REMIND_MINUTES } from '../lib/google';
import { BoltIcon, CheckIcon, SendIcon } from './icons';

export function TaskSheet({ id, today, onClose, onNotice }: { id: string; today: string; onClose: () => void; onNotice: (t: string) => void }) {
  const task = useLiveQuery(() => db.tasks.get(id), [id]);
  const googleOn = !!useLiveQuery(() => db.settings.get('google_auth'));
  const [title, setTitle] = useState<string | null>(null);
  const [newSub, setNewSub] = useState('');
  const [newComment, setNewComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<number>(0);
  // сколько подзадач было при открытии: подсказка появляется, только если их добавили сейчас
  const initialSubs = useRef<number | null>(null);
  const [energyTouched, setEnergyTouched] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (task && initialSubs.current === null) initialSubs.current = task.subs.length;
    if (task && title === null) setTitle(task.title);
  }, [task, title]);

  if (task === undefined) return null;
  if (task === null) return null;

  const flash = () => {
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1800);
  };
  const patch = async (p: Partial<Task>) => {
    await updateTask(task.id, p);
    flash();
  };

  const addSub = async () => {
    const v = newSub.trim();
    if (!v) return;
    setNewSub('');
    await patch({ subs: [...task.subs, { id: uid(), title: v, done: false }] });
  };
  const addComment = async () => {
    const v = newComment.trim();
    if (!v) return;
    setNewComment('');
    await patch({ comments: [...task.comments, { id: uid(), text: v, at: Date.now() }] });
  };
  const moveTo = async (d: string) => {
    await moveTask(task, d);
    onNotice(`Перенесено на ${d === addDays(today, 1) ? 'завтра' : shortDate(d)}`);
    onClose();
  };

  const pill = (
    <span className="saved-pill" role="status" aria-live="polite" style={{ opacity: saved ? 1 : 0, marginRight: 'auto' }}>
      <CheckIcon size={13} style={{ color: 'var(--accent-text)' }} />
      Сохранено
    </span>
  );

  const extra = subtasksBump(task.subs.length) - subtasksBump(initialSubs.current ?? task.subs.length);
  const suggested = !energyTouched && !task.done && extra > 0 && task.energy < 3 ? (Math.min(3, task.energy + extra) as Energy) : null;

  return (
    <Sheet title="Задача" onClose={onClose} doneLabel="Готово" headerExtra={pill}>
      <div className="field">
        <label htmlFor="ts-title">Название</label>
        <input
          id="ts-title"
          className="input"
          style={{ fontWeight: 600 }}
          value={title ?? ''}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title && title.trim() && title !== task.title && patch({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <div className="field">
        <span className="label">Подзадачи</span>
        <div className="list-box">
          {task.subs.map((s) => (
            <div key={s.id} className="list-row" style={{ justifyContent: 'flex-start', minHeight: 48 }}>
              <button
                className="check small"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.title}
                onClick={() => patch({ subs: task.subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
              >
                {s.done && <CheckIcon size={13} style={{ color: '#fff' }} />}
              </button>
              <span className={`task-title${s.done ? ' done' : ''}`} style={{ fontSize: 15, flex: 1 }}>
                {s.title}
              </span>
              <button
                className="btn-text"
                style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 14 }}
                aria-label={`Удалить подзадачу: ${s.title}`}
                onClick={() => patch({ subs: task.subs.filter((x) => x.id !== s.id) })}
              >
                Убрать
              </button>
            </div>
          ))}
          <div className="list-row" style={{ minHeight: 48 }}>
            <label htmlFor="ts-sub" className="sr-only">
              Новая подзадача
            </label>
            <input
              id="ts-sub"
              value={newSub}
              placeholder="Новая подзадача"
              enterKeyHint="done"
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              style={{ flex: 1, minWidth: 0, height: 44, border: 0, background: 'transparent', fontSize: 15, fontWeight: 500, outline: 'none' }}
            />
            <button className="btn-text" onClick={addSub}>
              Добавить
            </button>
          </div>
        </div>
      </div>

      <div className="grid2" style={{ gap: 10 }}>
        <div className="field">
          <label htmlFor="ts-deadline">Дедлайн</label>
          <input id="ts-deadline" type="date" className="input" value={task.deadline} onChange={(e) => patch({ deadline: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ts-time">Напоминание</label>
          <input id="ts-time" type="time" className="input" value={task.time} onChange={(e) => patch({ time: e.target.value })} />
        </div>
      </div>
      {task.time && !task.done && (
        <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4, marginTop: -8 }}>
          {googleOn ? `Google напомнит за ${REMIND_MINUTES} минут` : 'Чтобы пришло уведомление, подключи Google в настройках'}
        </span>
      )}

      <div className="field">
        <span className="label">Нагрузка</span>
        <div className="grid3">
          {([1, 2, 3] as Energy[]).map((v) => (
            <button
              key={v}
              className="chip"
              aria-pressed={task.energy === v}
              aria-label={['', 'Лёгкая', 'Средняя', 'Тяжёлая'][v]}
              onClick={() => {
                setEnergyTouched(true);
                patch({ energy: v });
              }}
            >
              {Array.from({ length: v }, (_, i) => (
                <BoltIcon key={i} color="var(--bolt)" />
              ))}
            </button>
          ))}
        </div>
        {suggested && (
          <div className="inline-row drop" style={{ gap: 8, minHeight: 52 }}>
            <span className="sub" style={{ fontWeight: 600, lineHeight: 1.35 }}>
              С {task.subs.length} подзадачами задача, похоже, тяжелее
            </span>
            <button
              className="btn-text"
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 1 }}
              onClick={() => {
                setEnergyTouched(true);
                patch({ energy: suggested });
              }}
            >
              <span style={{ marginRight: 4 }}>Сделать</span>
              {Array.from({ length: suggested }, (_, k) => (
                <BoltIcon key={k} size={13} color="var(--bolt)" />
              ))}
            </button>
          </div>
        )}
      </div>

      <div className="field">
        <span className="label">Список</span>
        <div className="grid2">
          {(
            [
              ['work', 'Работа'],
              ['personal', 'Личное']
            ] as [ListId, string][]
          ).map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={task.list === v} onClick={() => patch({ list: v })}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Комментарии</span>
        {task.comments.map((c) => (
          <div key={c.id} className="comment">
            <span className="caption">{new Date(c.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            <span>{c.text}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label htmlFor="ts-comment" className="sr-only">
            Новый комментарий
          </label>
          <textarea
            id="ts-comment"
            className="input"
            rows={2}
            value={newComment}
            placeholder="Комментарий"
            onChange={(e) => setNewComment(e.target.value)}
            style={{ flex: 1, minWidth: 0, fontSize: 15 }}
          />
          <button className="btn btn-primary" style={{ width: 48, padding: 0, borderRadius: 12 }} aria-label="Добавить комментарий" onClick={addComment}>
            <SendIcon />
          </button>
        </div>
      </div>

      <div className="field" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <span className="label">Перенести</span>
        <div className="grid2">
          <button className="btn btn-secondary" onClick={() => moveTo(addDays(today, 1))}>
            На завтра
          </button>
          <label className="btn btn-secondary" style={{ position: 'relative', overflow: 'hidden' }}>
            На другой день
            <input
              type="date"
              aria-label="Перенести на дату"
              min={today}
              onChange={(e) => e.target.value && moveTo(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
            />
          </label>
        </div>
      </div>

      {confirmDelete ? (
        <div className="grid2">
          <button
            className="btn btn-primary"
            onClick={async () => {
              await deleteTask(task.id);
              onNotice('Задача удалена');
              onClose();
            }}
          >
            Удалить
          </button>
          <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
            Отмена
          </button>
        </div>
      ) : (
        <button className="btn-text" onClick={() => setConfirmDelete(true)}>
          Удалить задачу
        </button>
      )}
    </Sheet>
  );
}
