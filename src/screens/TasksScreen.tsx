import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, type ListId, type Task } from '../db';
import { moveTask, setDone } from '../lib/actions';
import { budgetFor, loadOn, phaseMod, phaseOn, proposePlan } from '../lib/plan';
import { usePlan } from '../lib/usePlan';
import { PHASE_IN } from '../lib/cycle';
import { load } from '../lib/battery';
import { DOW_SHORT, addDays, dayNum, dowIdx, fromKey, longDate, monthTitle, mondayOf, plural, shortDate, toKey } from '../lib/dates';
import { Bolts, Load } from '../components/Bolts';
import { TaskRow } from '../components/TaskRow';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, GearIcon } from '../components/icons';

type Filter = 'all' | ListId;

export function TasksScreen({
  today,
  selected,
  onSelect,
  openTask,
  openSettings,
  notify
}: {
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  openTask: (id: string) => void;
  openSettings: () => void;
  notify: (t: string) => void;
}) {
  const plan = usePlan(today);
  const overloaded = (d: string) => !!plan && d >= today && loadOn(plan, d) > budgetFor(plan, d);
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
  // точка: есть задачи; фуксия — день перегружен относительно ожидаемых сил
  const dot = (d: string) => (overloaded(d) ? (d === selected ? '#fff' : 'var(--accent)') : counts.get(d) ? (d === selected ? 'rgba(255,255,255,0.7)' : 'var(--faint)') : 'transparent');

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
  const selLoad = plan && selected >= today ? loadOn(plan, selected) : planned;
  const selBudget = plan && selected >= today ? budgetFor(plan, selected) : null;
  const ofBudget = <Load n={`${selLoad} из ~${selBudget ?? 0}`} size={12} />;
  let summary: React.ReactNode = null;
  if (dayTasks.length + movedAway.length > 0 || (selected >= today && selLoad > 0)) {
    if (selected < today) {
      summary = (
        <>
          сделано {doneN} из {dayTasks.length}
        </>
      );
    } else if (selected === today) {
      summary = (
        <>
          сделано {doneN} из {dayTasks.length}
          {selBudget != null && <> · {ofBudget}</>}
        </>
      );
    } else {
      summary = selBudget != null ? <>в плане {ofBudget}</> : <>в плане <Load n={planned} size={12} /></>;
    }
  }

  // разгрузка выбранного дня: все списки, для сегодня — вместе с просроченными
  const isOver = overloaded(selected);
  const toUnload = (tasks ?? []).filter((t) => !t.done && (t.date === selected || (selected === today && t.date < today)));
  const unload = isOver && plan ? proposePlan(plan, toUnload, selected) : [];
  const selPhase = plan ? phaseOn(plan, selected) : null;
  const selMod = plan ? phaseMod(plan, selected) : 0;
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const anyOver = (monthMode ? monthCells : weekDays).some(overloaded);
  const doUnload = async () => {
    for (const m of unload) await moveTask(m.task, m.to);
    notify(`Перенесено: ${unload.length} ${plural(unload.length, 'задача', 'задачи', 'задач')}`);
  };

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

      {anyOver && (
        <span className="legend" style={{ marginTop: -4 }}>
          <span>
            <i style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--accent)' }} />
            день перегружен по ожидаемым силам
          </span>
        </span>
      )}

      {isOver && plan && (
        <div className="proposal drop" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>
            В плане {selLoad} из ~<Load n={selBudget ?? 0} size={13} /> — больше, чем обычно по силам
          </span>
          <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            {selected === today && plan.todayBudget != null
              ? 'Сегодняшний бюджет посчитан по заряду дня.'
              : selMod < 0 && selPhase
                ? `Обычный день — около 6 молний. В ${PHASE_IN[selPhase]} фазе твой recovery в среднем ниже, поэтому ожидаем меньше.`
                : selMod > 0 && selPhase
                  ? `Обычный день — около 6 молний. В ${PHASE_IN[selPhase]} фазе твой recovery в среднем выше, поэтому ожидаем больше.`
                  : 'Для будущих дней ориентир — обычный день, около 6 молний. Утром бюджет уточнится по recovery и самочувствию.'}
          </span>
          {unload.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {unload.map((m) => (
                <div key={m.task.id} className="proposal-item">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ overflowWrap: 'anywhere' }}>{m.task.title}</span>
                    <span className="caption" style={{ fontWeight: 600 }}>
                      → {m.to === addDays(today, 1) ? 'завтра' : `${DOW_SHORT[dowIdx(m.to)].toLowerCase()}, ${shortDate(m.to)}`}
                    </span>
                  </span>
                  <Bolts n={m.task.energy} />
                </div>
              ))}
            </div>
          )}
          {unload.length > 0 ? (
            <button className="btn btn-secondary" style={{ background: 'var(--surface)', height: 44, alignSelf: 'flex-start' }} onClick={doUnload}>
              Перенести {unload.length} {plural(unload.length, 'задачу', 'задачи', 'задач')}
            </button>
          ) : (
            <span className="caption" style={{ fontWeight: 500 }}>
              Перенести нечего: у задач есть время или дедлайн, их переносишь только ты.
            </span>
          )}
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
