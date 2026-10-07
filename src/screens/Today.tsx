import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { db, type Task } from '../db';
import { dismissPlan, moveTask, setDone, setMood } from '../lib/actions';
import { BUDGET, ZONE_COLOR, ZONE_LABEL, cheer, dayCharge, load, proposeMoves, zoneOf } from '../lib/battery';
import { fmtHM } from '../lib/whoop';
import { addDays, longDate, plural, toKey } from '../lib/dates';
import { Bolts, Load } from '../components/Bolts';
import { DoneRow, TaskRow } from '../components/TaskRow';
import { ChevronDown, GearIcon } from '../components/icons';

const MOOD_WORDS = ['', 'без сил', 'мало сил', 'нормально', 'хорошо', 'полна энергии'];

export function MoodPicker({ value, onPick }: { value?: number; onPick: (n: number) => void }) {
  return (
    <>
      <div className="grid5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className="mood-btn" aria-pressed={value === n} aria-label={`${n} из 5, ${MOOD_WORDS[n]}`} onClick={() => onPick(n)}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }} className="caption">
        <span>без сил</span>
        <span>полна энергии</span>
      </div>
    </>
  );
}

const sortTasks = (a: Task, b: Task) => (a.time || '99') .localeCompare(b.time || '99') || a.createdAt - b.createdAt;

export function Today({
  today,
  openTask,
  openSettings,
  notify
}: {
  today: string;
  openTask: (id: string) => void;
  openSettings: () => void;
  notify: (t: string) => void;
}) {
  const all = useLiveQuery(() => db.tasks.where('date').belowOrEqual(today).toArray(), [today]);
  const day = useLiveQuery(() => db.days.get(today), [today]);
  const whoop = useLiveQuery(() => db.whoop.get(today), [today]);
  const [details, setDetails] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [editMood, setEditMood] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const cheers = useRef(0);

  if (all === undefined) return <div className="screen" />;

  const doneToday = (t: Task) => t.done && t.doneAt != null && toKey(new Date(t.doneAt)) === today;
  const dayTasks = all.filter((t) => t.date === today || (t.date < today && (!t.done || doneToday(t))));
  const active = dayTasks.filter((t) => !t.done).sort(sortTasks);
  const done = dayTasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  const mood = day?.mood;
  const charge = dayCharge(mood, whoop?.recovery);
  const zone = charge != null ? zoneOf(charge) : null;
  const budget = zone ? BUDGET[zone] : null;
  const planned = load(dayTasks);
  const proposals = budget != null && !day?.planDismissed ? proposeMoves(dayTasks, today, budget) : [];
  const proposedIds = planOpen ? new Set(proposals.map((t) => t.id)) : new Set<string>();

  const complete = (t: Task) => {
    if (pending.includes(t.id)) return;
    const left = active.length - pending.length - 1;
    notify(cheer(cheers.current++, zone, left));
    setPending((p) => [...p, t.id]);
    setTimeout(async () => {
      await setDone(t.id, true);
      setPending((p) => p.filter((x) => x !== t.id));
    }, 600);
  };

  const accept = async () => {
    const tomorrow = addDays(today, 1);
    for (const t of proposals) await moveTask(t, tomorrow);
    setPlanOpen(false);
    notify(`Перенесено на завтра: ${proposals.length} ${plural(proposals.length, 'задача', 'задачи', 'задач')}`);
  };

  return (
    <div className="screen">
      <div className="header">
        <h1>{longDate(today)}</h1>
        <button className="icon-btn" aria-label="Настройки" onClick={openSettings}>
          <GearIcon />
        </button>
      </div>

      {charge != null && (
        <div className="card battery-card">
          <button className="battery-btn" aria-expanded={details} onClick={() => setDetails(!details)} aria-label={`Заряд ${charge}%, ${ZONE_LABEL[zone!]}. Подробнее`}>
            <span className="battery" aria-hidden="true">
              <span className="battery-shell">
                <span className="battery-fill" style={{ width: `${charge}%`, background: ZONE_COLOR[zone!] }} />
              </span>
              <span className="battery-tip" />
            </span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="battery-pct">{charge}%</span>
              <span className="sub" style={{ fontSize: 15 }}>
                {ZONE_LABEL[zone!]}
              </span>
            </span>
            <ChevronDown size={20} className={`chev${details ? ' open' : ''}`} />
          </button>
          {details && (
            <div className="drop" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
              <div className="grid3">
                <div className="metric">
                  <span className="caption">Recovery</span>
                  <b>{whoop?.recovery != null ? `${whoop.recovery}%` : whoop?.recoveryState === 'PENDING_SCORE' ? 'считается' : '—'}</b>
                </div>
                <div className="metric">
                  <span className="caption">Сон</span>
                  <b>{fmtHM(whoop?.sleepMs)}</b>
                </div>
                <div className="metric">
                  <span className="caption">Самочувствие</span>
                  <b>{mood ? `${mood} из 5` : '—'}</b>
                </div>
              </div>
              <div className="inline-row">
                <span className="sub">Бюджет дня</span>
                <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <Load n={budget!} />
                  <span className="sub" style={{ fontSize: 15 }}>
                    · в плане
                  </span>
                  <Load n={planned} />
                </span>
              </div>
              {mood && (
                <button className="btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => setEditMood(true)}>
                  Изменить самочувствие
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {(!mood || editMood) && (
        <div className="card drop" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Как ты сегодня?</span>
            {whoop?.recovery == null && (
              <span className="sub" style={{ fontWeight: 500 }}>
                Пока нет данных WHOOP, заряд дня считается по самочувствию
              </span>
            )}
          </div>
          <MoodPicker
            value={mood}
            onPick={async (n) => {
              await setMood(today, n);
              setEditMood(false);
            }}
          />
        </div>
      )}

      {proposals.length > 0 && (
        <div className="proposal drop">
          <button className="proposal-head" aria-expanded={planOpen} onClick={() => setPlanOpen(!planOpen)}>
            <span>
              Перенести {proposals.length} {plural(proposals.length, 'задачу', 'задачи', 'задач')} на завтра?
            </span>
            <span className="btn-text" style={{ minHeight: 0 }}>
              {planOpen ? 'Скрыть' : 'Показать'}
            </span>
          </button>
          {planOpen && (
            <div className="drop" style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16 }}>
              <span className="sub" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', paddingBottom: 4 }}>
                В плане <Load n={planned} size={12} /> при бюджете дня <Load n={budget!} size={12} />
              </span>
              {proposals.map((t) => (
                <div key={t.id} className="proposal-item">
                  <span>{t.title}</span>
                  <Bolts n={t.energy} />
                </div>
              ))}
              <div className="grid2" style={{ paddingTop: 4 }}>
                <button className="btn btn-primary" onClick={accept}>
                  Перенести
                </button>
                <button
                  className="btn"
                  style={{ background: 'var(--surface)' }}
                  onClick={() => {
                    dismissPlan(today);
                    setPlanOpen(false);
                  }}
                >
                  Оставить
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section" style={{ paddingTop: 8 }}>
        <h2>Задачи</h2>
        {active.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            today={today}
            checked={pending.includes(t.id)}
            highlight={proposedIds.has(t.id) ? 'на завтра?' : undefined}
            onToggle={() => (pending.includes(t.id) ? undefined : complete(t))}
            onOpen={() => openTask(t.id)}
          />
        ))}
        {dayTasks.length === 0 && (
          <div className="empty dashed" style={{ minHeight: 72, justifyContent: 'center' }}>
            На сегодня задач нет. Добавь первую кнопкой «+»
          </div>
        )}
        {dayTasks.length > 0 && active.length === 0 && (
          <div className="empty drop">
            <b>Все задачи на сегодня сделаны</b>
            <span>Можно выдохнуть</span>
          </div>
        )}
        {done.length > 0 && (
          <>
            <button className="done-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen(!doneOpen)}>
              Сделано · {done.length}
              <ChevronDown size={16} className={`chev${doneOpen ? ' open' : ''}`} />
            </button>
            {doneOpen && (
              <div className="drop" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {done.map((t) => (
                  <DoneRow key={t.id} task={t} onToggle={() => setDone(t.id, false)} onOpen={() => openTask(t.id)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
