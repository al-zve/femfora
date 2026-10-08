import type { Task } from '../db';
import { fromDate, plural, shortDate } from '../lib/dates';
import { Bolts } from './Bolts';
import { CheckIcon } from './icons';

export function taskMeta(t: Task, today: string) {
  const parts: string[] = [];
  if (t.time) parts.push(t.time);
  if (t.date < today && !t.done) parts.push(fromDate(t.date));
  if (t.deadline) parts.push(`до ${shortDate(t.deadline)}`);
  if (t.subs.length) parts.push(`подзадачи ${t.subs.filter((s) => s.done).length}/${t.subs.length}`);
  if (t.comments.length) parts.push(`${t.comments.length} ${plural(t.comments.length, 'комментарий', 'комментария', 'комментариев')}`);
  return parts.join(' · ');
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
          {(meta || highlight) && (
            <span className="task-meta">
              {meta}
              {highlight && <span className="hl">{(meta ? ' · ' : '') + highlight}</span>}
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
