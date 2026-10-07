import { json, sameOrigin, type Ctx } from '../../../lib-functions/shared';

const API = 'https://api.prod.whoop.com/developer';
const PATHS: Record<string, string> = {
  recovery: '/v2/recovery',
  sleep: '/v2/activity/sleep',
  cycle: '/v2/cycle',
  profile: '/v2/user/profile/basic'
};

/** Прокси к WHOOP API: браузер не может ходить туда напрямую из-за CORS. Ничего не сохраняет. */
export const onRequestGet = async ({ request }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const path = PATHS[url.searchParams.get('type') ?? ''];
  const auth = request.headers.get('Authorization');
  if (!path) return json({ error: 'bad_type' }, 400);
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const q = new URLSearchParams();
  for (const k of ['start', 'end', 'limit', 'nextToken']) {
    const v = url.searchParams.get(k);
    if (v) q.set(k, v);
  }
  const r = await fetch(`${API}${path}${q.size ? `?${q}` : ''}`, { headers: { Authorization: auth, Accept: 'application/json' } });
  return json(await r.text(), r.status);
};

/** Отзыв доступа приложения к WHOOP */
export const onRequestDelete = async ({ request }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const r = await fetch(`${API}/v2/user/access`, { method: 'DELETE', headers: { Authorization: auth } });
  return json({ ok: r.ok }, r.ok ? 200 : r.status);
};
