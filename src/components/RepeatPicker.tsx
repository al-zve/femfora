import type { RepeatMode, RepeatRule, Series } from '../db';
import { DOW_SHORT, dayNum, dowIdx, plural, shortDate } from '../lib/dates';
import { describe, firstOn } from '../lib/repeat';

export type RepeatKind = 'none' | 'daily' | 'weekdays' | 'interval' | 'monthly';

export interface RepeatDraft {
  kind: RepeatKind;
  days: number[];
  n: number;
  unit: 'day' | 'week';
  mode: RepeatMode;
}

export const noRepeat = (date: string): RepeatDraft => ({ kind: 'none', days: [dowIdx(date)], n: 2, unit: 'day', mode: 'schedule' });

export function draftOf(s: Series | undefined, date: string): RepeatDraft {
  const d = noRepeat(date);
  if (!s) return d;
  const r = s.rule;
  return {
    ...d,
    kind: r.kind,
    mode: s.mode,
    days: r.kind === 'weekdays' ? r.days : d.days,
    n: r.kind === 'interval' ? r.n : d.n,
    unit: r.kind === 'interval' ? r.unit : d.unit
  };
}

/** правило из черновика; число месяца — по дню, с которого начинается повтор */
export function ruleOf(d: RepeatDraft, date: string): RepeatRule | null {
  switch (d.kind) {
    case 'none':
      return null;
    case 'daily':
      return { kind: 'daily' };
    case 'weekdays':
      return d.days.length ? { kind: 'weekdays', days: [...d.days].sort((a, b) => a - b) } : null;
    case 'interval':
      return { kind: 'interval', n: d.n, unit: d.unit };
    case 'monthly':
      return { kind: 'monthly', dom: dayNum(date) };
  }
}

const KINDS: [RepeatKind, string][] = [
  ['none', 'Нет'],
  ['daily', 'Ежедневно'],
  ['weekdays', 'По дням'],
  ['interval', 'Каждые N'],
  ['monthly', 'Раз в месяц']
];

export function RepeatPicker({ value, date, onChange }: { value: RepeatDraft; date: string; onChange: (d: RepeatDraft) => void }) {
  const set = (p: Partial<RepeatDraft>) => onChange({ ...value, ...p });
  const rule = ruleOf(value, date);
  const first = rule && value.kind === 'weekdays' ? firstOn(rule, date) : null;
  const max = value.unit === 'week' ? 12 : 60;

  return (
    <div className="field">
      <span className="label">Повтор</span>
      <div className="grid3">
        {KINDS.slice(0, 3).map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={value.kind === k} onClick={() => set({ kind: k })}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid2">
        {KINDS.slice(3).map(([k, l]) => (
          <button key={k} className="chip" aria-pressed={value.kind === k} onClick={() => set({ kind: k })}>
            {l}
          </button>
        ))}
      </div>

      {value.kind === 'weekdays' && (
        <div className="grid7 drop" role="group" aria-label="Дни недели">
          {DOW_SHORT.map((l, i) => (
            <button
              key={l}
              className="chip"
              aria-pressed={value.days.includes(i)}
              onClick={() => set({ days: value.days.includes(i) ? value.days.filter((x) => x !== i) : [...value.days, i] })}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {value.kind === 'interval' && (
        <div className="drop" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="list-box">
            <div className="list-row">
              {value.unit === 'week' ? plural(value.n, 'Каждую', 'Каждые', 'Каждые') : plural(value.n, 'Каждый', 'Каждые', 'Каждые')}
              <span className="stepper">
                <button aria-label="Меньше" disabled={value.n <= 1} onClick={() => set({ n: value.n - 1 })}>
                  −
                </button>
                <output aria-live="polite" style={{ minWidth: 88 }}>
                  {value.n} {value.unit === 'week' ? plural(value.n, 'неделю', 'недели', 'недель') : plural(value.n, 'день', 'дня', 'дней')}
                </output>
                <button aria-label="Больше" disabled={value.n >= max} onClick={() => set({ n: value.n + 1 })}>
                  +
                </button>
              </span>
            </div>
          </div>
          <div className="grid2">
            <button className="chip" aria-pressed={value.unit === 'day'} onClick={() => set({ unit: 'day' })}>
              Дни
            </button>
            <button className="chip" aria-pressed={value.unit === 'week'} onClick={() => set({ unit: 'week', n: Math.min(value.n, 12) })}>
              Недели
            </button>
          </div>
        </div>
      )}

      {value.kind !== 'none' && (
        <div className="drop" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <span className="label">Следующий повтор</span>
          <div className="grid2">
            <button className="chip" aria-pressed={value.mode === 'schedule'} onClick={() => set({ mode: 'schedule' })}>
              По расписанию
            </button>
            <button className="chip" aria-pressed={value.mode === 'after'} onClick={() => set({ mode: 'after' })}>
              После выполнения
            </button>
          </div>
          <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            {!rule
              ? 'Выбери хотя бы один день недели.'
              : `${describe(rule, value.mode)}${value.kind === 'monthly' && dayNum(date) > 28 ? ', в коротких месяцах — в последний день' : ''}. ` +
                (value.mode === 'schedule'
                  ? 'Повторы стоят на своих днях на две недели вперёд. Если не успела, повтор тихо пропадёт, а следующий будет в свой день.'
                  : 'Следующий повтор появится, когда отметишь этот. Пока не сделала, он ждёт.') +
                (first && first !== date ? ` Первый — ${DOW_SHORT[dowIdx(first)].toLowerCase()}, ${shortDate(first)}.` : '')}
          </span>
        </div>
      )}
    </div>
  );
}
