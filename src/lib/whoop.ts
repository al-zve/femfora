import { db, type WhoopDay } from '../db';

type Auth = { access: string; refresh: string; expiresAt: number };
type TokenResponse = { access_token: string; refresh_token: string; expires_in?: number };
class HttpError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const SCOPES = 'offline read:recovery read:sleep read:cycles read:profile';
const redirectUri = () => `${location.origin}/whoop/callback`;

function randomState() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => abc[x % abc.length]).join('');
}

type Pending = { state: string; privateKey: CryptoKey; url: string; at: number };
const PENDING_TTL = 15 * 60_000;

export const getPending = async () => {
  const p = (await db.settings.get('whoop_pending'))?.value as Pending | undefined;
  if (p && Date.now() - p.at > PENDING_TTL) {
    await db.settings.delete('whoop_pending');
    return undefined;
  }
  return p;
};

/**
 * Готовит ссылку для входа в WHOOP. Сам вход пользовательница проходит в Safari:
 * окно поверх приложения с домашнего экрана на iPhone зависает.
 * Результат входа шифруется ключом, который есть только у этого приложения.
 */
export async function startConnect() {
  const r = await fetch('/api/whoop/config');
  if (!r.ok) throw new Error('WHOOP ещё не настроен на сервере');
  const { clientId } = (await r.json()) as { clientId: string };
  const state = randomState();
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const b = await fetch('/api/whoop/begin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, pub }) });
  if (!b.ok) throw new Error('Сервер не готов к подключению WHOOP');
  const url = `${AUTH_URL}?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri(), scope: SCOPES, state })}`;
  await db.settings.put({ key: 'whoop_pending', value: { state, privateKey: pair.privateKey, url, at: Date.now() } satisfies Pending });
  return url;
}

export const cancelConnect = () => db.settings.delete('whoop_pending');

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Забрать результат входа с сервера. true — подключено, false — ещё ждём */
export async function claimPending(): Promise<boolean> {
  const p = await getPending();
  if (!p) return false;
  const r = await fetch('/api/whoop/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: p.state }) });
  if (r.status === 202) return false;
  if (!r.ok) throw new HttpError(`HTTP ${r.status}`, r.status);
  const sealed = (await r.json()) as { epk: JsonWebKey; iv: string; data: string };
  const epk = await crypto.subtle.importKey('jwk', sealed.epk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: epk }, p.privateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) as BufferSource }, key, fromB64(sealed.data) as BufferSource);
  const tok = JSON.parse(new TextDecoder().decode(plain)) as TokenResponse;
  if (!tok.access_token) throw new Error('WHOOP не выдал доступ');
  await saveAuth(tok);
  await db.settings.delete('whoop_pending');
  return true;
}

async function tokenRequest(body: { code?: string; refresh_token?: string }): Promise<TokenResponse> {
  const r = await fetch('/api/whoop/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new HttpError(j.error_description || j.error || `HTTP ${r.status}`, r.status);
  return j;
}

async function saveAuth(j: TokenResponse) {
  await db.settings.put({
    key: 'whoop_auth',
    value: { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 } satisfies Auth
  });
  await db.settings.delete('whoop_error');
}

/** Страница возврата из WHOOP: отдаём код серверу. Возвращает true, если это окно и есть приложение и всё уже подключено */
export async function finishConnect(params: URLSearchParams) {
  if (params.get('error')) throw new Error(params.get('error_description') || 'Доступ к WHOOP не выдан');
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) throw new Error('WHOOP вернул неполный ответ');
  const r = await fetch('/api/whoop/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, state }) });
  if (r.status === 410) throw new Error('Ссылка для входа устарела. Нажми «Подключить» в приложении ещё раз.');
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error_description || j.error || `Ошибка ${r.status}`);
  }
  const local = await getPending();
  if (local?.state === state) return claimPending();
  return false;
}

export const getAuth = async () => (await db.settings.get('whoop_auth'))?.value as Auth | undefined;

async function accessToken(): Promise<string> {
  const run = async () => {
    const a = await getAuth();
    if (!a) throw new Error('NOT_CONNECTED');
    if (a.expiresAt - 60_000 > Date.now()) return a.access;
    try {
      const j = await tokenRequest({ refresh_token: a.refresh });
      await saveAuth(j);
      return j.access_token;
    } catch (e) {
      if (e instanceof HttpError && (e.status === 400 || e.status === 401)) {
        await db.settings.delete('whoop_auth');
        await db.settings.put({ key: 'whoop_error', value: 'reauth' });
      }
      throw e;
    }
  };
  return navigator.locks ? navigator.locks.request('whoop-token', run) : run();
}

async function api<T>(type: string, params: Record<string, string>): Promise<T> {
  const t = await accessToken();
  const r = await fetch(`/api/whoop/data?${new URLSearchParams({ type, ...params })}`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new HttpError(`WHOOP ${r.status}`, r.status);
  return r.json() as Promise<T>;
}

async function all<T>(type: string, start: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined;
  for (let i = 0; i < 40; i++) {
    const p: Record<string, string> = { limit: '25', start };
    if (next) p.nextToken = next;
    const j = await api<{ records?: T[]; next_token?: string }>(type, p);
    out.push(...(j.records ?? []));
    next = j.next_token;
    if (!next) break;
  }
  return out;
}

/** Дата по местному времени записи WHOOP */
export function localKey(iso: string, offset?: string) {
  const t = Date.parse(iso);
  let mins = -new Date(t).getTimezoneOffset();
  const m = offset?.match(/([+-])(\d{2}):?(\d{2})/);
  if (m) mins = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(t + mins * 60_000).toISOString().slice(0, 10);
}

type Cycle = { id: number; start: string; timezone_offset?: string; score_state: string; score?: { strain?: number } };
type Recovery = {
  cycle_id: number;
  score_state: string;
  score?: { recovery_score: number; resting_heart_rate: number; hrv_rmssd_milli: number; spo2_percentage?: number; skin_temp_celsius?: number };
};
type Sleep = {
  cycle_id?: number;
  end: string;
  timezone_offset?: string;
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
    };
  };
};

let syncing: Promise<void> | null = null;

export function syncWhoop(force = false) {
  if (!syncing) syncing = doSync(force).finally(() => (syncing = null));
  return syncing;
}

async function doSync(force: boolean) {
  if (!(await getAuth())) return;
  const meta = (await db.settings.get('whoop_sync'))?.value as { at: number } | undefined;
  if (!force && meta && Date.now() - meta.at < 10 * 60_000) return;

  const days = meta ? 5 : 120;
  const start = new Date(Date.now() - days * 86_400_000).toISOString();
  const cycles = await all<Cycle>('cycle', start);
  const recs = await all<Recovery>('recovery', start);
  const sleeps = await all<Sleep>('sleep', start);

  const now = Date.now();
  const byCycle = new Map<number, WhoopDay>();
  const byDate = new Map<string, WhoopDay>();
  for (const c of cycles) {
    const d: WhoopDay = { date: localKey(c.start, c.timezone_offset), cycleId: c.id, updatedAt: now };
    if (c.score_state === 'SCORED' && c.score?.strain != null) d.strain = Math.round(c.score.strain * 10) / 10;
    byCycle.set(c.id, d);
    byDate.set(d.date, d);
  }
  for (const r of recs) {
    const d = byCycle.get(r.cycle_id);
    if (!d) continue;
    d.recoveryState = r.score_state;
    if (r.score_state === 'SCORED' && r.score) {
      d.recovery = Math.round(r.score.recovery_score);
      d.hrv = Math.round(r.score.hrv_rmssd_milli);
      d.rhr = Math.round(r.score.resting_heart_rate);
      d.spo2 = r.score.spo2_percentage;
      d.skinTemp = r.score.skin_temp_celsius;
    }
  }
  for (const s of sleeps) {
    if (s.nap || s.score_state !== 'SCORED' || !s.score) continue;
    const d = (s.cycle_id != null && byCycle.get(s.cycle_id)) || byDate.get(localKey(s.end, s.timezone_offset));
    if (!d) continue;
    const st = s.score.stage_summary;
    d.deepMs = st.total_slow_wave_sleep_time_milli;
    d.remMs = st.total_rem_sleep_time_milli;
    d.lightMs = st.total_light_sleep_time_milli;
    d.awakeMs = st.total_awake_time_milli;
    d.inBedMs = st.total_in_bed_time_milli;
    d.sleepMs = st.total_slow_wave_sleep_time_milli + st.total_rem_sleep_time_milli + st.total_light_sleep_time_milli;
    d.sleepPerf = s.score.sleep_performance_percentage;
  }
  await db.whoop.bulkPut([...byCycle.values()]);
  await db.settings.put({ key: 'whoop_sync', value: { at: Date.now() } });
}

export async function disconnectWhoop() {
  try {
    const t = await accessToken();
    await fetch('/api/whoop/data', { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
  } catch {
    /* отключаем локально в любом случае */
  }
  await db.settings.bulkDelete(['whoop_auth', 'whoop_sync', 'whoop_pending', 'whoop_error']);
}

export const fmtHM = (ms?: number) => {
  if (ms == null) return '—';
  const m = Math.round(ms / 60_000);
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
};
