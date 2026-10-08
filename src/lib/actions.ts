import { db, uid, type Energy, type ListId, type Task } from '../db';
import { daysBetween } from './dates';

export function parseQuickTitle(raw: string) {
  const m = raw.match(/@\s?([01]?\d|2[0-3])[:.]([0-5]\d)/);
  if (!m) return { title: raw.trim(), time: '' };
  const time = `${m[1].padStart(2, '0')}:${m[2]}`;
  return { title: raw.replace(m[0], '').replace(/\s{2,}/g, ' ').trim(), time };
}

export async function addTask(input: { title: string; date: string; energy: Energy; list: ListId; subs: string[] }) {
  const { title, time } = parseQuickTitle(input.title);
  const now = Date.now();
  const task: Task = {
    id: uid(),
    title: title || 'Новая задача',
    date: input.date,
    time,
    deadline: '',
    energy: input.energy,
    list: input.list,
    done: false,
    doneAt: null,
    subs: input.subs.map((s) => ({ id: uid(), title: s, done: false })),
    comments: [],
    createdAt: now,
    updatedAt: now
  };
  await db.tasks.add(task);
  return task;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  await db.tasks.update(id, { ...patch, updatedAt: Date.now() });
}

export async function setDone(id: string, done: boolean) {
  await updateTask(id, { done, doneAt: done ? Date.now() : null });
}

export async function moveTask(task: Task, to: string) {
  if (task.date === to) return;
  await db.transaction('rw', db.tasks, db.moves, async () => {
    await db.moves.add({ id: uid(), taskId: task.id, title: task.title, from: task.date, to, at: Date.now() });
    await db.tasks.update(task.id, { date: to, updatedAt: Date.now() });
  });
}

export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.moves, async () => {
    await db.tasks.delete(id);
    await db.moves.where('taskId').equals(id).delete();
  });
}

export async function setMood(date: string, mood: number) {
  const day = await db.days.get(date);
  await db.days.put({ ...(day ?? { date }), mood });
}

export async function dismissPlan(date: string) {
  const day = await db.days.get(date);
  await db.days.put({ ...(day ?? { date }), planDismissed: true });
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

/**
 * Отметка начала месячных. Повторное нажатие снимает отметку.
 * Если рядом (ближе 14 дней) уже есть отметка — переносим её: это исправление даты, а не новый цикл.
 */
export async function markPeriodStart(date: string): Promise<'added' | 'removed' | 'moved'> {
  return db.transaction('rw', db.periods, async () => {
    if (await db.periods.get(date)) {
      await db.periods.delete(date);
      return 'removed';
    }
    const near = (await db.periods.toArray()).find((p) => Math.abs(daysBetween(p.start, date)) < 14);
    if (near) await db.periods.delete(near.start);
    await db.periods.put({ start: date, createdAt: Date.now() });
    return near ? 'moved' : 'added';
  });
}
