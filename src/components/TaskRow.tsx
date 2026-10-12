import type { Task } from '../db';
import { fromDate, plural, shortDate } from '../lib/dates';
import { Bolts } from './Bolts';
import { CheckIcon } from './icons';

export interface MetaPart {
  text: string;
  /** выделить цветом: просроченный дедлайн */
  hl?: boolean;
}

export function taskMeta(t: Task, today: string): MetaPart[] {
  const parts: MetaPart[] = [];
  if (t.time) parts.push({ text: t.time });
  if (t.date < today && !t.done) parts.push({ text: fromDate(t.date) });
  if (t.deadline) {
    if (!t.done && t.deadline < today) parts.push({ text: `срок прошёл ${shortDate(t.deadline)}`, hl: true });
    else if (!t.done && t.deadline === today) parts.push({ text: 'срок сегодня', hl: true });
    else parts.push({ text: `до ${shortDate(t.deadline)}` });
  }
  if (t.subs.length) parts.push({ text: `подзадачи ${t.subs.filter((s) => s.done).length}/${t.subs.length}` });
  if (t.comments.length) parts.push({ text: `${t.comments.length} ${plural(t.comments.length, 'комментарий', 'комментария', 'комментариев')}` });
  return parts;
}

export function TaskRow({
  task,
  today,
  checked,
  highlight,
  onToggle,
  onOpen
}: {
  task: Task;
  today: string;
  checked: boolean;
  highlight?: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const meta = taskMeta(task, today);
  return (
    <div className="task">
      <button
        className="check"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${checked ? 'Вернуть в работу' : 'Отметить выполненной'}: ${task.title}`}
        onClick={onToggle}
      >
        {checked && <CheckIcon style={{ color: '#fff' }} />}
      </button>
      <button className="task-body" onClick={onOpen}>
        <span className="task-text">
          <span className={`task-title${checked ? ' done' : ''}`}>{task.title}</span>
          {(meta.length > 0 || highlight) && (
            <span className="task-meta">
              {meta.map((m, i) => (
                <span key={i} className={m.hl ? 'hl' : undefined}>
                  {(i ? ' · ' : '') + m.text}
                </span>
              ))}
              {highlight && <span className="hl">{(meta.length ? ' · ' : '') + highlight}</span>}
            </span>
          )}
        </span>
        <Bolts n={task.energy} />
      </button>
    </div>
  );
}

export function DoneRow({ task, onToggle, onOpen }: { task: Task; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="task is-done">
      <button className="check" role="checkbox" aria-checked={true} aria-label={`Вернуть в работу: ${task.title}`} onClick={onToggle}>
        <CheckIcon style={{ color: '#fff' }} />
      </button>
      <button className="task-body" onClick={onOpen}>
        <span className="task-title done">{task.title}</span>
      </button>
    </div>
  );
}
