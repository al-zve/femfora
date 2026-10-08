import { useState } from 'react';
import { type CycleModel, dayInfo, marksFor, nextStart } from '../lib/cycle';
import { markPeriodStart } from '../lib/actions';
import { DOW_SHORT, addDays, dayNum, fromKey, longDate, monthTitle, mondayOf, plural, shortDate, toKey } from '../lib/dates';
import { ChevronLeft, ChevronRight } from './icons';

export function CycleCard({ model, today, notify }: { model: CycleModel; today: string; notify: (t: string) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = fromKey(today);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const info = dayInfo(model, today);
  const marks = marksFor(model, today);
  const hasData = model.starts.length > 0;
  const next = nextStart(model);

  const shift = (dir: number) =>
    setCursor(({ y, m }) => {
      const n = m + dir;
      return n < 0 ? { y: y - 1, m: 11 } : n > 11 ? { y: y + 1, m: 0 } : { y, m: n };
    });

  const first = toKey(new Date(cursor.y, cursor.m, 1));
  const last = toKey(new Date(cursor.y, cursor.m + 1, 0));
  const cells: string[] = [];
  for (let d = mondayOf(first); d <= addDays(mondayOf(last), 6); d = addDays(d, 1)) cells.push(d);

  const tap = async (d: string) => {
    const r = await markPeriodStart(d);
    notify(r === 'removed' ? 'Отметка снята' : r === 'moved' ? `Начало перенесено на ${shortDate(d)}` : `Начало месячных: ${shortDate(d)}`);
  };

  const recent = model.lengths.slice(-6);
  const canMarkToday = !info || info.day > model.periodLen;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!hasData && (
        <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
          Нажми на первый день последних месячных. Появятся день цикла, фаза и прогноз. Данные остаются только на этом устройстве.
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="cal-nav" style={{ margin: '-6px -10px 0' }}>
          <button className="icon-btn" style={{ margin: 0 }} aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
            <ChevronLeft />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 800 }}>{monthTitle(cursor.y, cursor.m)}</span>
          <button className="icon-btn" style={{ margin: 0 }} aria-label="Следующий месяц" onClick={() => shift(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="cyc-grid">
          {DOW_SHORT.map((d) => (
            <span key={d} className="month-dow">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const mk = marks(d);
            const inMonth = d >= first && d <= last;
            const future = d > today;
            const cls = ['cyc-cell', !inMonth && 'out', inMonth && d < today && 'past', d === today && 'today', mk.actual && 'actual', mk.predicted && 'predicted']
              .filter(Boolean)
              .join(' ');
            const notes = [mk.isStart && 'начало месячных', mk.actual && !mk.isStart && 'месячные', mk.predicted && 'прогноз месячных', mk.ovulation && 'овуляция примерно'].filter(Boolean).join(', ');
            return (
              <button key={d} className={cls} disabled={future} aria-pressed={mk.isStart} aria-label={`${longDate(d)}${notes ? `, ${notes}` : ''}`} onClick={() => tap(d)}>
                {dayNum(d)}
                {mk.ovulation && <span className="ov" />}
              </button>
            );
          })}
        </div>
        <div className="legend" style={{ paddingTop: 4 }}>
          <span>
            <i style={{ background: 'var(--period)' }} />
            месячные
          </span>
          <span>
            <i style={{ border: '1.5px dashed var(--period)' }} />
            прогноз
          </span>
          <span>
            <i style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--ok)' }} />
            овуляция ≈
          </span>
        </div>
        {hasData && (
          <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            Нажми на день, чтобы отметить начало месячных, повторное нажатие снимает отметку.
          </span>
        )}
      </div>

      {canMarkToday && (
        <button className="btn btn-secondary" onClick={() => tap(today)}>
          Месячные начались сегодня
        </button>
      )}

      {hasData && (
        <>
          <div className="divider" />
          <div className="grid2">
            <div className="metric">
              <span className="caption">{info && info.lateBy > 0 ? 'Ожидались' : 'Следующие'}</span>
              <b>{next ? `≈ ${shortDate(next)}` : '—'}</b>
            </div>
            <div className="metric">
              <span className="caption">Средний цикл</span>
              <b>{recent.length ? `${model.avgLen} ${plural(model.avgLen, 'день', 'дня', 'дней')}` : '—'}</b>
            </div>
          </div>
          {recent.length === 0 && (
            <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4, marginTop: -8 }}>
              Пока прогноз по среднему циклу в 28 дней. Отметь ещё одно начало, и он станет точнее.
            </span>
          )}
          {recent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="caption">
                {recent.length === 1 ? 'Последний цикл' : `Последние ${recent.length} ${plural(recent.length, 'цикл', 'цикла', 'циклов')}`}, дней
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
                {recent.map((c) => (
                  <span key={c.start} className="cyc-len">
                    <b>{c.len}</b>
                    <span>{shortDate(c.start)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
