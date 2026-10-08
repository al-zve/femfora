import type { Task, WhoopDay } from '../db';
import { BUDGET, load } from './battery';
import { type CycleModel, type Phase, dayInfo, predictedStarts } from './cycle';
import { addDays, toKey } from './dates';

/** Бюджет дня, для которого ещё нет recovery: обычный «умеренный» день */
export const DEFAULT_BUDGET = BUDGET.mid;
/** Насколько recovery в фазе должен отличаться от твоего среднего, чтобы это влияло на план */
export const PHASE_THRESHOLD = 8;
/** На сколько дней вперёд ищем, куда перенести */
const HORIZON = 14;

export interface PhaseAdjust {
  avg: number;
  overall: number;
  mod: -1 | 0 | 1;
  days: number;
}

/**
 * Поправка бюджета по фазам — только по твоим данным.
 * Берём завершённые циклы; нужно минимум 2 цикла и 5 дней с recovery в фазе.
 */
export function phaseAdjustments(m: CycleModel | undefined, whoop: WhoopDay[]): Partial<Record<Phase, PhaseAdjust>> {
  if (!m || m.starts.length < 3) return {};
  const lastStart = m.starts[m.starts.length - 1];
  const by: Record<Phase, number[]> = { menstrual: [], follicular: [], ovulatory: [], luteal: [] };
  const all: number[] = [];
  const cycles = new Set<string>();
  for (const w of whoop) {
    if (w.recovery == null) continue;
    const info = dayInfo(m, w.date);
    if (!info || info.cycleStart === lastStart) continue;
    by[info.phase].push(w.recovery);
    all.push(w.recovery);
    cycles.add(info.cycleStart);
  }
  if (cycles.size < 2 || all.length < 20) return {};
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const overall = avg(all);
  const out: Partial<Record<Phase, PhaseAdjust>> = {};
  (Object.keys(by) as Phase[]).forEach((p) => {
    if (by[p].length < 5) return;
    const a = avg(by[p]);
    const d = a - overall;
    out[p] = { avg: Math.round(a), overall: Math.round(overall), days: by[p].length, mod: d <= -PHASE_THRESHOLD ? -1 : d >= PHASE_THRESHOLD ? 1 : 0 };
  });
  return out;
}

export interface PlanCtx {
  today: string;
  /** бюджет сегодня по заряду (recovery + самочувствие), если он известен */
  todayBudget: number | null;
  /** нагрузка по дням: невыполненные задачи (просроченные — на сегодня) и сделанное сегодня */
  loads: Map<string, number>;
  model?: CycleModel;
  adj: Partial<Record<Phase, PhaseAdjust>>;
}

export function buildLoads(tasks: Task[], today: string) {
  const loads = new Map<string, number>();
  const add = (d: string, n: number) => loads.set(d, (loads.get(d) ?? 0) + n);
  for (const t of tasks) {
    if (!t.done) add(t.date < today ? today : t.date, t.energy);
    else if (t.doneAt != null && toKey(new Date(t.doneAt)) === today && t.date <= today) add(today, t.energy);
  }
  return loads;
}

/** Фаза на дату; для будущих дат — по прогнозу следующих циклов */
export function phaseOn(ctx: PlanCtx, date: string): Phase | null {
  const m = ctx.model;
  if (!m || !m.starts.length) return null;
  if (date <= ctx.today) return dayInfo(m, date)?.phase ?? null;
  const ext = { ...m, starts: [...m.starts, ...predictedStarts(m, ctx.today, 8)] };
  return dayInfo(ext, date)?.phase ?? null;
}

export function phaseMod(ctx: PlanCtx, date: string) {
  const p = phaseOn(ctx, date);
  return p ? (ctx.adj[p]?.mod ?? 0) : 0;
}

/** Ожидаемый бюджет дня в молниях */
export function budgetFor(ctx: PlanCtx, date: string) {
  if (date === ctx.today && ctx.todayBudget != null) return ctx.todayBudget;
  return DEFAULT_BUDGET + phaseMod(ctx, date);
}

export const loadOn = (ctx: PlanCtx, date: string) => ctx.loads.get(date) ?? 0;

/**
 * Ближайший день после `after`, где задача помещается в бюджет.
 * Без дедлайна, если такого нет, — день с наибольшим запасом. null — переносить некуда.
 */
export function bestDay(ctx: PlanCtx, energy: number, after: string, deadline?: string, extra?: Map<string, number>) {
  let best: string | null = null;
  let bestFree = 0;
  for (let i = 1; i <= HORIZON; i++) {
    const d = addDays(after, i);
    if (d < ctx.today) continue;
    if (deadline && d > deadline) return null; // до дедлайна места нет — лучше оставить как есть
    const free = budgetFor(ctx, d) - loadOn(ctx, d) - (extra?.get(d) ?? 0);
    if (free >= energy) return d;
    if (free > bestFree) {
      bestFree = free;
      best = d;
    }
  }
  return best;
}

export interface Move {
  task: Task;
  to: string;
}

/**
 * Что перенести с дня `date`, чтобы нагрузка уложилась в бюджет.
 * Не трогаем сделанные, задачи со временем и задачи с дедлайном в этот день или раньше.
 * Сначала тяжёлые; каждую — на ближайший день, где для неё есть запас сил.
 */
export function proposePlan(ctx: PlanCtx, dayTasks: Task[], date: string, budget = budgetFor(ctx, date)) {
  let total = load(dayTasks);
  const movable = dayTasks.filter((t) => !t.done && !t.time && !(t.deadline && t.deadline <= date)).sort((a, b) => b.energy - a.energy);
  const extra = new Map<string, number>();
  const out: Move[] = [];
  for (const t of movable) {
    if (total <= budget) break;
    const to = bestDay(ctx, t.energy, date, t.deadline || undefined, extra);
    if (!to) continue;
    out.push({ task: t, to });
    extra.set(to, (extra.get(to) ?? 0) + t.energy);
    total -= t.energy;
  }
  return out;
}
