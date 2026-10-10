import { db } from '../db';
import { daysBetween, toKey } from './dates';
import { setSetting } from './actions';

/**
 * Импорт из Maya (CSV из экспорта приложения). Файл читается только на устройстве.
 * Берём ТОЛЬКО раздел с датами месячных (history_dates: start_date,end_date).
 * Остальные разделы (настроение, симптомы, заметки, вес и т. д.) не разбираем и не сохраняем.
 */

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** «20-Aug-2014» или «2014-08-20» → ключ даты */
export function parseMayaDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon == null) return null;
    const d = new Date(Number(m[3]), mon, Number(m[1]));
    return d.getDate() === Number(m[1]) ? toKey(d) : null;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  return null;
}

export interface MayaPeriod {
  start: string;
  end: string | null;
}

export interface MayaParsed {
  periods: MayaPeriod[];
  /** медиана длительности месячных по файлу, дней */
  periodLen: number | null;
}

export function parseMaya(text: string): MayaParsed {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const periods: MayaPeriod[] = [];
  let i = lines.findIndex((l) => l.trim().toLowerCase() === 'history_dates');
  if (i < 0) throw new Error('В файле нет раздела с датами месячных. Это точно экспорт из Maya?');
  const header = (lines[i + 1] ?? '').toLowerCase().split(',').map((x) => x.trim());
  const si = header.indexOf('start_date');
  const ei = header.indexOf('end_date');
  if (si < 0) throw new Error('Не нашла колонку start_date в разделе с датами месячных');
  for (i = i + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) break; // пустая строка — конец раздела, дальше не читаем
    const cols = line.split(',');
    const start = parseMayaDate(cols[si] ?? '');
    if (!start) continue;
    let end = ei >= 0 ? parseMayaDate(cols[ei] ?? '') : null;
    if (end && (end < start || daysBetween(start, end) > 14)) end = null;
    periods.push({ start, end });
  }
  periods.sort((a, b) => a.start.localeCompare(b.start));
  const lens = periods.filter((p) => p.end).map((p) => daysBetween(p.start, p.end!) + 1).sort((a, b) => a - b);
  const periodLen = lens.length ? lens[Math.floor(lens.length / 2)] : null;
  return { periods, periodLen };
}

export interface ImportPlan {
  add: string[];
  existing: number;
}

/** Какие начала месячных добавить: пропускаем те, что уже отмечены (или есть отметка ближе 10 дней) */
export async function planImport(parsed: MayaParsed): Promise<ImportPlan> {
  const have = (await db.periods.toArray()).map((p) => p.start);
  const add: string[] = [];
  let existing = 0;
  for (const p of parsed.periods) {
    const near = [...have, ...add].some((s) => Math.abs(daysBetween(s, p.start)) < 10);
    if (near) existing++;
    else add.push(p.start);
  }
  return { add, existing };
}

export async function applyImport(plan: ImportPlan, periodLen: number | null) {
  const now = Date.now();
  await db.periods.bulkPut(plan.add.map((start) => ({ start, createdAt: now })));
  if (periodLen && periodLen >= 2 && periodLen <= 10) await setSetting('period_len', periodLen);
}
