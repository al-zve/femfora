import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, type ListId, type Task } from '../db';
import { setDone } from '../lib/actions';
import { load } from '../lib/battery';
import { DOW_SHORT, addDays, dayNum, dowIdx, fromKey, longDate, monthTitle, mondayOf, shortDate, toKey } from '../lib/dates';
import { Bolts, Load } from '../components/Bolts';
import { TaskRow } from '../components/TaskRow';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, GearIcon } from '../components/icons';

type Filter = 'all' | ListId;

export function TasksScreen({
  today,
  selected,
  onSelect,
  openTask,
  openSettings
}: {
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  openTask: (id: string) => void;
  openSettings: () => void;
}) {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const moves = useLiveQuery(() => db.moves.toArray(), []);
  const [weekStart, setWeekStart] = useState(mondayOf(selected));
  const [monthMode, setMonthMode] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = fromKey(selected);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [filter, setFilter] = useState<Filter>('all');
  const swipeX = useRef<number | null>(null);

  const counts = new Map<string, number>();
  (tasks ?? []).forEach((t) => counts.set(t.date, (counts.get(t.date) ?? 0) + 1));

  const pick = (d: string) => {
    onSelect(d);
    setWeekStart(mondayOf(d));
    setMonthMode(false);
  };

  const shift = (dir: number) => {
    if (monthMode) {
      setCursor(({ y, m }) => {
        const n = m + dir;
        return n < 0 ? { y: y - 1, m: 11 } : n > 11 ? { y: y + 1, m: 0 } : { y, m: n };
      });
    } else {
      setWeekStart((w) => addDays(w, dir * 7));
    }
  };

  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      swipeX.current = e.clientX;
    },
    onPointerUp: (e: React.PointerEvent) => {
      if (swipeX.current == null) return;
      const dx = e.clientX - swipeX.current;
      swipeX.current = null;
      if (Math.abs(dx) > 40) shift(dx < 0 ? 1 : -1);
    }
  };

  const cellStyle = (d: string) => {
    const sel = d === selected;
    const isToday = d === today;
    return {
      background: sel ? 'var(--accent)' : isToday ? 'var(--soft)' : 'transparent',
      color: sel ? '#fff' : isToday ? 'var(--accent-text)' : d < today ? 'var(--muted)' : 'var(--text)'
    };
  };
  const dot = (d: string) => (counts.get(d) ? (d === selected ? '#fff' : 'var(--accent)') : 'transparent');

  const mid = fromKey(addDays(weekStart, 3));
  const title = monthMode ? monthTitle(cursor.y, cursor.m) : monthTitle(mid.getFullYear(), mid.getMonth());
  const atToday = selected === today && (monthMode ? true : weekStart === mondayOf(today));

  const monthCells: string[] = [];
  if (monthMode) {
    const first = toKey(new Date(cursor.y, cursor.m, 1));
    const last = toKey(new Date(cursor.y, cursor.m + 1, 0));
    for (let d = mondayOf(first); d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) monthCells.push(d);
  }

  const byList = (t: { list?: ListId }) => filter === 'all' || t.list === filter;
  const dayTasks = (tasks ?? []).filter((t) => t.date === selected && byList(t)).sort((a, b) => Number(a.done) - Number(b.done) || (a.time || '99').localeCompare(b.time || '99'));
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t] as [string, Task]));
  const movedAway = (moves ?? [])
    .filter((m) => m.from === selected)
    .filter((m) => {
      const t = taskById.get(m.taskId);
      return t && t.date !== selected && byList(t);
    });

  const doneN = dayTasks.filter((t) => t.done).length;
  const planned = load(dayTasks);
  let summary: React.ReactNode = null;
  if (dayTasks.length + movedAway.length > 0) {
    if (selected <= today) {
      summary = (
        <>
          сделано {doneN} из {dayTasks.length}
          {selected === today && (
            <>
              {' · '}
              <Load n={planned} size={12} />
            </>
          )}
        </>
      );
    } else {
      summary = (
        <>
          в плане <Load n={planned} size={12} />
        </>
      );
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <h1>Задачи</h1>
        <button className="icon-btn" aria-label="Настройки" onClick={openSettings}>
          <GearIcon />
        </button>
      </div>

      <div className="cal-nav">
        <button className="icon-btn" style={{ margin: 0 }} aria-label={monthMode ? 'Предыдущий месяц' : 'Предыдущая неделя'} onClick={() => shift(-1)}>
          <ChevronLeft />
        </button>
        <button
          className="cal-title"
          aria-expanded={monthMode}
          onClick={() => {
            const d = fromKey(selected);
            setCursor({ y: d.getFullYear(), m: d.getMonth() });
            setMonthMode(!monthMode);
          }}
        >
          {title}
          <ChevronDown size={16} className={`chev${monthMode ? ' open' : ''}`} />
        </button>
        <button className="icon-btn" style={{ margin: 0 }} aria-label={monthMode ? 'Следующий месяц' : 'Следующая неделя'} onClick={() => shift(1)}>
          <ChevronRight />
        </button>
        <div style={{ flex: 1 }} />
        {!atToday && (
          <button className="btn btn-secondary" style={{ height: 36, borderRadius: 18, fontSize: 14, marginRight: 10 }} onClick={() => pick(today)}>
            Сегодня
          </button>
        )}
      </div>

      {!monthMode ? (
        <div className="week" {...swipe}>
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
            <button key={d} className="day-cell" style={cellStyle(d)} aria-pressed={d === selected} aria-label={longDate(d)} onClick={() => pick(d)}>
              <span className="dow">{DOW_SHORT[dowIdx(d)]}</span>
              <span className="num">{dayNum(d)}</span>
              <span className="dot" style={{ background: dot(d) }} />
            </button>
          ))}
        </div>
      ) : (
        <div className="month drop" {...swipe}>
          <div className="month-grid">
            {DOW_SHORT.map((d) => (
              <span key={d} className="month-dow">
                {d}
              </span>
            ))}
            {monthCells.map((d) => {
              const inMonth = fromKey(d).getMonth() === cursor.m;
              const st = cellStyle(d);
              return (
                <button
                  key={d}
                  className="month-cell"
                  aria-pressed={d === selected}
                  aria-label={longDate(d)}
                  style={{ ...st, color: !inMonth && d !== selected ? 'var(--faint)' : st.color, fontWeight: d === selected || d === today ? 800 : 600 }}
                  onClick={() => pick(d)}
                >
                  {dayNum(d)}
                  <span className="dot" style={{ background: dot(d) }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="seg" style={{ marginTop: 4 }}>
        {(
          [
            ['all', 'Все'],
            ['work', 'Работа'],
            ['personal', 'Личное']
          ] as [Filter, string][]
        ).map(([v, l]) => (
          <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </div>

      <div className="section" style={{ paddingTop: 8 }}>
        <div className="section-head">
          <h2>{selected === today ? `Сегодня, ${shortDate(today)}` : longDate(selected)}</h2>
          {summary && (
            <span className="sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              {summary}
            </span>
          )}
        </div>

        {dayTasks.length + movedAway.length === 0 && (
          <div className="empty dashed" style={{ minHeight: 72, justifyContent: 'center' }}>
            Задач нет
          </div>
        )}

        {dayTasks.map((t) => (
          <TaskRow key={t.id} task={t} today={today} checked={t.done} onToggle={() => setDone(t.id, !t.done)} onOpen={() => openTask(t.id)} />
        ))}

        {movedAway.map((m) => {
          const t = taskById.get(m.taskId)!;
          return (
            <div key={m.id} className="task" style={{ opacity: 0.85 }}>
              <span className="moved-mark" aria-label="Перенесена">
                <ArrowRight />
              </span>
              <button className="task-body" onClick={() => openTask(t.id)}>
                <span className="task-text">
                  <span className="task-title muted">{m.title}</span>
                  <span className="task-meta">перенесена на {shortDate(m.to)}</span>
                </span>
                <Bolts n={t.energy} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
