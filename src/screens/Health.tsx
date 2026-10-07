import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type WhoopDay } from '../db';
import { setMood } from '../lib/actions';
import { ZONE_COLOR, ZONE_LABEL, zoneOf } from '../lib/battery';
import { DOW_SHORT, addDays, dowIdx, shortDate, toKey } from '../lib/dates';
import { fmtHM } from '../lib/whoop';
import { WhoopConnect } from '../components/WhoopConnect';
import { BoltIcon, GearIcon } from '../components/icons';
import { MoodPicker } from './Today';

type Range = 7 | 30;

const STAGES = [
  { key: 'deepMs', label: 'Глубокий', light: '#1C2E9E', dark: '#C5CEFF' },
  { key: 'remMs', label: 'REM', light: '#3F58DE', dark: '#8B9CF6' },
  { key: 'lightMs', label: 'Лёгкий', light: '#8C9DF2', dark: '#5068E0' },
  { key: 'awakeMs', label: 'Без сна', light: '#D3DAFB', dark: '#2E3870' }
] as const;

const isDark = () => document.documentElement.dataset.theme === 'dark';

function Chart({
  title,
  values,
  kind,
  color,
  min,
  max,
  sel,
  onSel,
  fmt,
  labels,
  bolt
}: {
  title: string;
  values: (number | undefined)[];
  kind: 'line' | 'bar';
  color: string;
  min: number;
  max: number;
  sel: number;
  onSel: (i: number) => void;
  fmt: (v: number) => string;
  labels: string[];
  bolt?: boolean;
}) {
  const n = values.length;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const present = values.filter((v): v is number => v != null);
  const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  const cur = values[sel];

  // линия рвётся там, где нет данных
  const segments: string[] = [];
  let seg: string[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (seg.length) segments.push(seg.join(' '));
      seg = [];
    } else seg.push(`${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - pct(v)).toFixed(2)}`);
  });
  if (seg.length) segments.push(seg.join(' '));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
          {avg != null && <span className="caption" style={{ fontWeight: 500 }}>ср. {fmt(avg)}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 16, fontWeight: 800 }}>
          {cur != null ? fmt(cur) : '—'}
          {bolt && cur != null && <BoltIcon size={13} color="var(--bolt)" />}
        </span>
      </div>
      <div style={{ position: 'relative', height: 72, borderBottom: '1px solid var(--line)' }}>
        <span
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${(sel / n) * 100}%`,
            width: `${100 / n}%`,
            background: 'color-mix(in srgb, var(--accent) 13%, transparent)',
            borderRadius: 6,
            transition: 'left 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        />
        {kind === 'bar' ? (
          <span style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {values.map((v, i) => (
              <span key={i} style={{ flex: 1, minWidth: 0, padding: '0 1px', display: 'flex', alignItems: 'flex-end' }}>
                <span
                  style={{
                    display: 'block',
                    width: '100%',
                    height: v != null ? `${Math.max(pct(v), v > 0 ? 3 : 0)}%` : 0,
                    background: color,
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
                  }}
                />
              </span>
            ))}
          </span>
        ) : (
          <>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
              {segments.map((pts, i) => (
                <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </svg>
            {cur != null && (
              <span
                style={{
                  position: 'absolute',
                  left: `${((sel + 0.5) / n) * 100}%`,
                  top: `${100 - pct(cur)}%`,
                  width: 10,
                  height: 10,
                  margin: '-5px 0 0 -5px',
                  borderRadius: 5,
                  background: color,
                  boxShadow: '0 0 0 2px var(--surface)',
                  transition: 'left 0.3s ease, top 0.3s ease'
                }}
              />
            )}
          </>
        )}
        <span style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {values.map((_, i) => (
            <button
              key={i}
              aria-label={`${title}, ${labels[i]}`}
              onClick={() => onSel(i)}
              style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: 0 }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function Health({ today, openSettings }: { today: string; openSettings: () => void }) {
  const [range, setRange] = useState<Range>(7);
  const [selRaw, setSel] = useState<number | null>(null);
  const from = addDays(today, -(range - 1));
  const day = useLiveQuery(() => db.days.get(today), [today]);
  const auth = useLiveQuery(() => db.settings.get('whoop_auth'));
  const whoopRows = useLiveQuery(() => db.whoop.where('date').between(addDays(from, -1), today, true, true).toArray(), [from, today]);
  const moods = useLiveQuery(() => db.days.where('date').between(from, today, true, true).toArray(), [from, today]);
  const doneTasks = useLiveQuery(() => db.tasks.filter((t) => t.done).toArray(), []);

  const dates = Array.from({ length: range }, (_, i) => addDays(from, i));
  const sel = selRaw == null || selRaw >= range ? range - 1 : selRaw;
  const w = new Map<string, WhoopDay>((whoopRows ?? []).map((r) => [r.date, r]));
  const moodBy = new Map((moods ?? []).map((d) => [d.date, d.mood]));
  const loadBy = new Map<string, number>();
  (doneTasks ?? []).forEach((t) => {
    if (!t.done || t.doneAt == null) return;
    const k = toKey(new Date(t.doneAt));
    loadBy.set(k, (loadBy.get(k) ?? 0) + t.energy);
  });

  const night = w.get(today);
  const yesterday = w.get(addDays(today, -1));
  const dark = isDark();
  const stageTotal = night ? STAGES.reduce((s, st) => s + (night[st.key] ?? 0), 0) : 0;
  const labels = dates.map((d) => shortDate(d));
  const col = { rec: dark ? '#2CC6C6' : '#00A3A3', pink: dark ? '#EA6BBB' : '#E0218A', blue: dark ? '#8B9CF6' : '#3F58DE' };

  return (
    <div className="screen">
      <div className="header">
        <h1>Здоровье</h1>
        <button className="icon-btn" aria-label="Настройки" onClick={openSettings}>
          <GearIcon />
        </button>
      </div>

      <section className="section">
        <h2>Прошлая ночь</h2>
        {!auth && !night ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
              Подключи WHOOP, чтобы видеть recovery, сон, HRV и пульс и чтобы заряд дня считался по ним.
            </span>
            <WhoopConnect />

          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div className="metric">
                <span className="caption">Recovery</span>
                <span style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }}>
                  {night?.recovery != null ? `${night.recovery}%` : night?.recoveryState === 'PENDING_SCORE' ? '…' : '—'}
                </span>
              </div>
              {night?.recovery != null && (
                <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, paddingBottom: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: ZONE_COLOR[zoneOf(night.recovery)] }} />
                  {ZONE_LABEL[zoneOf(night.recovery)]}
                </span>
              )}
            </div>
            <div className="grid3">
              <div className="metric">
                <span className="caption">HRV</span>
                <b>{night?.hrv != null ? `${night.hrv} мс` : '—'}</b>
              </div>
              <div className="metric">
                <span className="caption">Пульс покоя</span>
                <b>{night?.rhr ?? '—'}</b>
              </div>
              <div className="metric">
                <span className="caption">Strain вчера</span>
                <b>{yesterday?.strain != null ? String(yesterday.strain).replace('.', ',') : '—'}</b>
              </div>
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="caption">Сон</span>
                <b style={{ fontSize: 16 }}>{fmtHM(night?.sleepMs)}</b>
              </div>
              {stageTotal > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 2, height: 12 }} aria-hidden="true">
                    {STAGES.map((st) => (
                      <span key={st.key} style={{ width: `${((night![st.key] ?? 0) / stageTotal) * 100}%`, background: dark ? st.dark : st.light, borderRadius: 4 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {STAGES.map((st) => (
                      <span key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, whiteSpace: 'nowrap' }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: dark ? st.dark : st.light }} />
                        <span className="muted" style={{ fontWeight: 500 }}>
                          {st.label}
                        </span>
                        <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{fmtHM(night![st.key])}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Самочувствие</h2>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MoodPicker value={day?.mood} onPick={(n) => setMood(today, n)} />
        </div>
      </section>

      <section className="section">
        <div className="section-head" style={{ alignItems: 'center' }}>
          <h2>Динамика</h2>
          <div className="seg">
            {([7, 30] as Range[]).map((r) => (
              <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} style={{ height: 36, fontSize: 14 }}>
                {r} дней
              </button>
            ))}
          </div>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>
              {dates[sel] === today ? 'Сегодня' : DOW_SHORT[dowIdx(dates[sel])]}, {shortDate(dates[sel])}
            </span>
            <div className="caption" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, fontSize: 12 }}>
              <span>{labels[0]}</span>
              <span>{labels[labels.length - 1]}</span>
            </div>
          </div>
          <Chart title="Recovery" kind="line" color={col.rec} min={0} max={100} values={dates.map((d) => w.get(d)?.recovery)} sel={sel} onSel={setSel} fmt={(v) => `${Math.round(v)}%`} labels={labels} />
          <Chart title="Нагрузка задач" kind="bar" color={col.pink} min={0} max={10} values={dates.map((d) => loadBy.get(d) ?? 0)} sel={sel} onSel={setSel} fmt={(v) => String(Math.round(v * 10) / 10).replace('.', ',')} labels={labels} bolt />
          <Chart title="Сон" kind="bar" color={col.blue} min={0} max={10 * 3600_000} values={dates.map((d) => w.get(d)?.sleepMs)} sel={sel} onSel={setSel} fmt={(v) => fmtHM(v)} labels={labels} />
          <Chart title="Самочувствие" kind="bar" color={col.pink} min={0} max={5} values={dates.map((d) => moodBy.get(d))} sel={sel} onSel={setSel} fmt={(v) => (Math.round(v * 10) / 10).toString().replace('.', ',')} labels={labels} />
          <Chart title="HRV" kind="line" color={col.blue} min={20} max={110} values={dates.map((d) => w.get(d)?.hrv)} sel={sel} onSel={setSel} fmt={(v) => `${Math.round(v)} мс`} labels={labels} />
          <Chart title="Пульс покоя" kind="line" color={col.pink} min={40} max={80} values={dates.map((d) => w.get(d)?.rhr)} sel={sel} onSel={setSel} fmt={(v) => String(Math.round(v))} labels={labels} />
          <Chart title="Strain" kind="bar" color={col.blue} min={0} max={21} values={dates.map((d) => w.get(d)?.strain)} sel={sel} onSel={setSel} fmt={(v) => String(Math.round(v * 10) / 10).replace('.', ',')} labels={labels} />
        </div>
      </section>

      <section className="section">
        <h2>Цикл</h2>
        <div className="empty dashed" style={{ padding: 20, lineHeight: 1.4 }}>
          Календарь цикла, прогноз и импорт из Maya появятся на следующем этапе
        </div>
      </section>
    </div>
  );
}
