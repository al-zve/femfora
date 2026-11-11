import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Energy } from '../db';
import type { Example } from './estimate';

export type CalibAnswers = Record<string, Energy>;

/** Примеры для оценки: твои ответы в «Настроить оценку» и твои задачи. Всё хранится на устройстве */
export function useExamples(): Example[] {
  const calib = useLiveQuery(() => db.settings.get('energy_calib'))?.value as CalibAnswers | undefined;
  const tasks = useLiveQuery(() => db.tasks.orderBy('date').reverse().limit(300).toArray(), []);
  // повторы одной задачи — один пример, иначе ежедневная задача перевесит остальные
  const seen = new Set<string>();
  const own = (tasks ?? []).filter((t) => {
    const k = t.title.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...Object.entries(calib ?? {}).map(([title, energy]) => ({ title, energy })), ...own.map((t) => ({ title: t.title, energy: t.energy }))];
}
