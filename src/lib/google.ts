import { db, type Task } from '../db';
import { addTask } from './actions';
import { estimateEnergy } from './estimate';
import { addDays, todayKey } from './dates';

/**
 * Google: напоминания и входящие.
 * — Задачи со временем попадают в отдельный календарь «FemFora» с уведомлением за 10 минут.
 * — Задачи из списка Google Tasks «FemFora Inbox» переезжают в приложение и отмечаются выполненными в Google.
 * В Google уходят только названия и время задач. Данные о здоровье и цикле туда не попадают.
 * Права: calendar.app.created (только свой календарь FemFora) и tasks. Твои календари приложение не читает.
 */

type Auth = { access: string; refresh: string; expiresAt: number };
type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };
class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created', 'https://www.googleapis.com/auth/tasks'].join(' ');
const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
export const INBOX_TITLE = 'FemFora Inbox';
export const REMIND_MINUTES = 10;
const EVENT_MINUTES = 30;
const redirectUri = () => `${location.origin}/google/callback`;

function randomState() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => abc[x % abc.length]).join('');
}

/* ---------- вход (как у WHOOP: ссылка открывается в Safari, результат шифруется ключом приложения) ---------- */

type Pending = { state: string; privateKey: CryptoKey; url: string; at: number };
const PENDING_TTL = 15 * 60_000;

export const getGooglePending = async () => {
  const p = (await db.settings.get('google_pending'))?.value as Pending | undefined;
  if (p && Date.now() - p.at > PENDING_TTL) {
    await db.settings.delete('google_pending');
    return undefined;
  }
  return p;
};

export async function startGoogleConnect() {
  const r = await fetch('/api/google/config');
  if (!r.ok) throw new Error('Google ещё не настроен на сервере');
  const { clientId } = (await r.json()) as { clientId: string };
  const state = randomState();
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const b = await fetch('/api/google/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, pub }) });
  if (!b.ok) throw new Error('Сервер не готов к подключению Google');
  const url = `${AUTH_URL}?${new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent'
  })}`;
  await db.settings.put({ key: 'google_pending', value: { state, privateKey: pair.privateKey, url, at: Date.now() } satisfies Pending });
  return url;
}

export const cancelGoogleConnect = () => db.settings.delete('google_pending');

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function claimGoogle(): Promise<boolean> {
  const p = await getGooglePending();
  if (!p) return false;
  const r = await fetch('/api/google/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: p.state }) });
  if (r.status === 202) return false;
  if (!r.ok) throw new HttpError(`HTTP ${r.status}`, r.status);
  const sealed = (await r.json()) as { epk: JsonWebKey; iv: string; data: string };
  const epk = await crypto.subtle.importKey('jwk', sealed.epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: epk }, p.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) as BufferSource }, key, fromB64(sealed.data) as BufferSource);
  const tok = JSON.parse(new TextDecoder().decode(plain)) as TokenResponse;
  if (!tok.access_token || !tok.refresh_token) throw new Error('Google не выдал доступ');
  await saveAuth(tok);
  await db.settings.delete('google_pending');
  return true;
}

async function saveAuth(j: TokenResponse) {
  const prev = (await db.settings.get('google_auth'))?.value as Auth | undefined;
  // при обновлении Google не присылает новый refresh_token — храним прежний
  const refresh = j.refresh_token ?? prev?.refresh;
  if (!refresh) throw new Error('Нет refresh_token');
  await db.settings.put({ key: 'google_auth', value: { access: j.access_token, refresh, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 } satisfies Auth });
  await db.settings.delete('google_error');
}

/** Страница возврата из Google: отдаём код серверу. true — это окно и есть приложение, всё подключено */
export async function finishGoogle(params: URLSearchParams) {
  if (params.get('error')) throw new Error(params.get('error') === 'access_denied' ? 'Доступ к Google не выдан' : params.get('error')!);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) throw new Error('Google вернул неполный ответ');
  const r = await fetch('/api/google/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, state }) });
  if (r.status === 410) throw new Error('Ссылка для входа устарела. Нажми «Подключить» в приложении ещё раз.');
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error_description || j.error || `Ошибка ${r.status}`);
  }
  const local = await getGooglePending();
  if (local?.state === state) return claimGoogle();
  return false;
}

export const getGoogleAuth = async () => (await db.settings.get('google_auth'))?.value as Auth | undefined;

async function accessToken(): Promise<string> {
  const run = async () => {
    const a = await getGoogleAuth();
    if (!a) throw new Error('NOT_CONNECTED');
    if (a.expiresAt - 60_000 > Date.now()) return a.access;
    const r = await fetch('/api/google/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: a.refresh }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      if (r.status === 400 || r.status === 401) {
        await db.settings.delete('google_auth');
        await db.settings.put({ key: 'google_error', value: 'reauth' });
      }
      throw new HttpError(j.error_description || j.error || `HTTP ${r.status}`, r.status);
    }
    await saveAuth(j);
    return j.access_token as string;
  };
  return navigator.locks ? navigator.locks.request('google-token', run) : run();
}

async function gfetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const t = await accessToken();
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  if (r.status === 204) return undefined as T;
  if (!r.ok) throw new HttpError(`Google ${r.status}`, r.status);
  return r.json() as Promise<T>;
}

export async function disconnectGoogle() {
  const a = await getGoogleAuth();
  if (a) await fetch('/api/google/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: a.refresh }) }).catch(() => undefined);
  await db.settings.bulkDelete(['google_auth', 'google_pending', 'google_error', 'google_cal', 'google_list', 'google_sync', 'google_seen']);
}

/* ---------- напоминания: календарь «FemFora» ---------- */

type GEvent = { id: string; summary?: string; start?: { dateTime?: string }; extendedProperties?: { private?: Record<string, string> } };

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const pad = (n: number) => String(n).padStart(2, '0');

/** «2026-10-10» + «14:00» (+ минуты) → «2026-10-10T14:30:00» по местному времени */
export function localDateTime(date: string, time: string, plusMin = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + plusMin);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`;
}

async function ensureCalendar(): Promise<string> {
  const saved = (await db.settings.get('google_cal'))?.value as string | undefined;
  if (saved) {
    try {
      await gfetch(`${CAL}/calendars/${encodeURIComponent(saved)}`);
      return saved;
    } catch (e) {
      if (!(e instanceof HttpError) || (e.status !== 404 && e.status !== 410)) throw e;
    }
  }
  const cal = await gfetch<{ id: string }>(`${CAL}/calendars`, { method: 'POST', body: JSON.stringify({ summary: 'FemFora', description: 'Напоминания о задачах из FemFora', timeZone: tz() }) });
  await db.settings.put({ key: 'google_cal', value: cal.id });
  return cal.id;
}

const wanted = (t: Task, today: string) => !t.done && !!t.time && t.date >= today;

/** «2026-10-10T14:00:00+01:00» → «2026-10-10T14:00» (местное время события) */
const startKey = (s?: string) => (s ? s.slice(0, 16) : '');

export async function syncReminders() {
  const calId = await ensureCalendar();
  const today = todayKey();
  const base = `${CAL}/calendars/${encodeURIComponent(calId)}/events`;
  const timeMin = new Date(Date.now() - 86_400_000).toISOString();
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ timeMin, singleEvents: 'true', maxResults: '250', timeZone: tz() });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await gfetch<{ items?: GEvent[]; nextPageToken?: string }>(`${base}?${q}`);
    events.push(...(j.items ?? []));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  const tasks = await db.tasks.toArray();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();

  for (const ev of events) {
    const tid = ev.extendedProperties?.private?.ffTask;
    if (!tid) continue;
    const t = byId.get(tid);
    const evDay = startKey(ev.start?.dateTime).slice(0, 10);
    // прошлые дни не трогаем — это история
    if (evDay && evDay < today) continue;
    if (!t || !wanted(t, today) || seen.has(tid)) {
      await gfetch(`${base}/${ev.id}`, { method: 'DELETE' }).catch(() => undefined);
      continue;
    }
    seen.add(tid);
    const start = localDateTime(t.date, t.time);
    if (ev.summary !== t.title || startKey(ev.start?.dateTime) !== start.slice(0, 16)) {
      await gfetch(`${base}/${ev.id}`, { method: 'PATCH', body: JSON.stringify(eventBody(t)) });
    }
  }
  for (const t of tasks) {
    if (!wanted(t, today) || seen.has(t.id) || t.date > addDays(today, 90)) continue;
    await gfetch(base, { method: 'POST', body: JSON.stringify(eventBody(t)) });
  }
}

function eventBody(t: Task) {
  return {
    summary: t.title,
    description: 'Задача из FemFora',
    start: { dateTime: localDateTime(t.date, t.time), timeZone: tz() },
    end: { dateTime: localDateTime(t.date, t.time, EVENT_MINUTES), timeZone: tz() },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: REMIND_MINUTES }] },
    extendedProperties: { private: { ffTask: t.id } }
  };
}

/* ---------- входящие: Google Tasks «FemFora Inbox» ---------- */

type GTask = { id: string; title?: string; notes?: string; due?: string; status?: string; parent?: string; deleted?: boolean };

async function ensureInbox(): Promise<string> {
  const saved = (await db.settings.get('google_list'))?.value as string | undefined;
  const lists = await gfetch<{ items?: { id: string; title: string }[] }>(`${TASKS}/users/@me/lists?maxResults=100`);
  const found = (lists.items ?? []).find((l) => l.id === saved) ?? (lists.items ?? []).find((l) => l.title === INBOX_TITLE);
  if (found) {
    if (found.id !== saved) await db.settings.put({ key: 'google_list', value: found.id });
    return found.id;
  }
  const created = await gfetch<{ id: string }>(`${TASKS}/users/@me/lists`, { method: 'POST', body: JSON.stringify({ title: INBOX_TITLE }) });
  await db.settings.put({ key: 'google_list', value: created.id });
  return created.id;
}

/** Забрать новые задачи из «FemFora Inbox». Возвращает, сколько добавлено */
export async function syncInbox(): Promise<number> {
  const listId = await ensureInbox();
  const j = await gfetch<{ items?: GTask[] }>(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks?showCompleted=false&showHidden=false&maxResults=100`);
  const items = (j.items ?? []).filter((t) => !t.deleted && t.status !== 'completed' && t.title?.trim());
  if (!items.length) return 0;
  const seenIds = new Set(((await db.settings.get('google_seen'))?.value as string[] | undefined) ?? []);
  const today = todayKey();
  const calib = ((await db.settings.get('energy_calib'))?.value as Record<string, 1 | 2 | 3> | undefined) ?? {};
  const own = await db.tasks.toArray();
  const examples = [...Object.entries(calib).map(([title, energy]) => ({ title, energy })), ...own.map((t) => ({ title: t.title, energy: t.energy }))];

  const top = items.filter((t) => !t.parent);
  const children = items.filter((t) => t.parent);
  let added = 0;
  for (const g of top) {
    const done = [g, ...children.filter((c) => c.parent === g.id)];
    if (!seenIds.has(g.id)) {
      const subs = done.slice(1).map((c) => c.title!.trim());
      const due = g.due?.slice(0, 10);
      const task = await addTask({
        title: g.title!.trim(),
        date: due && due > today ? due : today,
        energy: estimateEnergy(g.title!, subs.length, examples).energy,
        list: 'personal',
        subs
      });
      if (g.notes?.trim()) await db.tasks.update(task.id, { comments: [{ id: crypto.randomUUID(), text: g.notes.trim(), at: Date.now() }] });
      seenIds.add(g.id);
      added++;
    }
    for (const c of done) {
      await gfetch(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }).catch(() => undefined);
    }
  }
  await db.settings.put({ key: 'google_seen', value: [...seenIds].slice(-500) });
  return added;
}

/* ---------- общий запуск ---------- */

let running: Promise<number> | null = null;
let again: 'all' | 'reminders' | null = null;

/** reminders — только напоминания (после изменения задач), иначе ещё и входящие */
export function syncGoogle(what: 'all' | 'reminders' = 'all'): Promise<number> {
  if (running) {
    // задачи поменялись во время синхронизации — повторим один раз после неё
    again = again === 'all' || what === 'all' ? 'all' : 'reminders';
    return running;
  }
  running = (async () => {
    if (!(await getGoogleAuth())) return 0;
    let added = 0;
    if (what === 'all') added = await syncInbox();
    await syncReminders();
    await db.settings.put({ key: 'google_sync', value: { at: Date.now() } });
    return added;
  })().finally(() => {
    running = null;
    if (again) {
      const next = again;
      again = null;
      syncGoogle(next).catch(() => undefined);
    }
  });
  return running;
}
