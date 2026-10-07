import type { Task } from '../db';

export type Zone = 'high' | 'mid' | 'low';

/** Пока WHOOP не подключён, заряд считается по самочувствию 1–5 */
export const MOOD_CHARGE = [0, 15, 35, 55, 75, 90];

/** Заряд дня: recovery WHOOP с поправкой на самочувствие; без WHOOP — только самочувствие */
export function dayCharge(mood?: number, recovery?: number): number | null {
  if (recovery != null && mood) return Math.round(0.75 * recovery + 0.25 * MOOD_CHARGE[mood]);
  if (recovery != null) return recovery;
  if (mood) return MOOD_CHARGE[mood];
  return null;
}

export const zoneOf = (charge: number): Zone => (charge >= 67 ? 'high' : charge >= 34 ? 'mid' : 'low');
export const ZONE_LABEL: Record<Zone, string> = {
  high: 'Можно нагружаться',
  mid: 'Умеренный день',
  low: 'Бережный день'
};
export const ZONE_COLOR: Record<Zone, string> = { high: '#00A3A3', mid: '#F49AC1', low: '#E0218A' };
export const BUDGET: Record<Zone, number> = { high: 10, mid: 6, low: 3 };

export const load = (tasks: Task[]) => tasks.reduce((s, t) => s + t.energy, 0);

/**
 * Какие задачи предложить перенести на завтра, чтобы нагрузка дня уложилась в бюджет.
 * Не трогаем выполненные, задачи со временем и задачи с дедлайном сегодня или раньше.
 */
export function proposeMoves(dayTasks: Task[], today: string, budget: number) {
  let total = load(dayTasks);
  const movable = dayTasks
    .filter((t) => !t.done && !t.time && !(t.deadline && t.deadline <= today))
    .sort((a, b) => b.energy - a.energy);
  const out: Task[] = [];
  for (const t of movable) {
    if (total <= budget) break;
    out.push(t);
    total -= t.energy;
  }
  return out;
}

const CHEERS = ['Отлично, одной меньше!', 'Так держать!', 'Ты справилась!', 'Шаг за шагом, всё получается', 'Хороший темп!', 'Минус одна. Ты молодец'];
const CHEERS_LOW = ['Бережно и по делу. Отлично!', 'Даже в тихий день у тебя получается', 'Маленький шаг тоже считается'];

export function cheer(n: number, zone: Zone | null, leftAfter: number) {
  if (leftAfter === 0) return 'Всё на сегодня сделано!';
  const pool = zone === 'low' ? CHEERS_LOW : CHEERS;
  return pool[n % pool.length];
}
