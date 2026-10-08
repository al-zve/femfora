import type { Task, WhoopDay } from '../db';
import { type CycleModel, dayInfo } from './cycle';
import { addDays, toKey } from './dates';

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface PhaseInsight {
  luteal: number;
  follicular: number;
  cycles: number;
  days: number;
}

/** Средний recovery в лютеиновой и фолликулярной фазе по завершённым циклам */
export function recoveryByPhase(m: CycleModel, whoop: WhoopDay[]): PhaseInsight | null {
  const lut: number[] = [];
  const fol: number[] = [];
  const cycles = new Set<string>();
  const lastStart = m.starts[m.starts.length - 1];
  for (const w of whoop) {
    if (w.recovery == null) continue;
    const info = dayInfo(m, w.date);
    // берём только завершённые циклы: в текущем фазы ещё прогноз
    if (!info || info.cycleStart === lastStart) continue;
    if (info.phase === 'luteal') lut.push(w.recovery);
    else if (info.phase === 'follicular') fol.push(w.recovery);
    else continue;
    cycles.add(info.cycleStart);
  }
  if (cycles.size < 2 || lut.length < 10 || fol.length < 10) return null;
  return { luteal: Math.round(avg(lut)), follicular: Math.round(avg(fol)), cycles: cycles.size, days: lut.length + fol.length };
}

export interface LoadInsight {
  heavy: number;
  light: number;
  days: number;
}

export const HEAVY_LOAD = 6;
export const LIGHT_LOAD = 3;

/** Recovery наутро после насыщенных и лёгких по задачам дней */
export function recoveryAfterLoad(tasks: Task[], whoop: WhoopDay[]): LoadInsight | null {
  const loadBy = new Map<string, number>();
  for (const t of tasks) {
    if (!t.done || t.doneAt == null) continue;
    const k = toKey(new Date(t.doneAt));
    loadBy.set(k, (loadBy.get(k) ?? 0) + t.energy);
  }
  const rec = new Map(whoop.filter((w) => w.recovery != null).map((w) => [w.date, w.recovery!]));
  const heavy: number[] = [];
  const light: number[] = [];
  // смотрим только дни, когда приложением уже пользовались
  const first = [...loadBy.keys()].sort()[0];
  if (!first) return null;
  for (const [date, r] of rec) {
    const prev = addDays(date, -1);
    if (prev < first) continue;
    const l = loadBy.get(prev) ?? 0;
    if (l >= HEAVY_LOAD) heavy.push(r);
    else if (l <= LIGHT_LOAD) light.push(r);
  }
  if (heavy.length < 5 || light.length < 5) return null;
  return { heavy: Math.round(avg(heavy)), light: Math.round(avg(light)), days: heavy.length + light.length };
}
