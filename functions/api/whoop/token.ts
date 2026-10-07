import { json, sameOrigin, sealFor, validState, type Ctx } from '../../../lib-functions/shared';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

/**
 * Обмен кода на токены и обновление токенов. Секрет приложения живёт только здесь.
 * При первом входе токены не отдаются тому окну, где прошёл вход: они шифруются ключом приложения
 * и ждут его до 15 минут, так вход работает из любого браузера.
 */
export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) return json({ error: 'not_configured' }, 503);

  const body = (await request.json().catch(() => ({}))) as { code?: string; state?: string; refresh_token?: string };
  const form = new URLSearchParams({ client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET });

  let pub: JsonWebKey | null = null;
  if (body.code) {
    if (!validState(body.state) || !env.WHOOP_HANDOFF) return json({ error: 'bad_state' }, 400);
    const raw = await env.WHOOP_HANDOFF.get(`begin:${body.state}`);
    if (!raw) return json({ error: 'expired' }, 410);
    pub = JSON.parse(raw) as JsonWebKey;
    form.set('grant_type', 'authorization_code');
    form.set('code', body.code);
    form.set('redirect_uri', `${new URL(request.url).origin}/whoop/callback`);
  } else if (body.refresh_token) {
    form.set('grant_type', 'refresh_token');
    form.set('refresh_token', body.refresh_token);
    form.set('scope', 'offline');
  } else {
    return json({ error: 'bad_request' }, 400);
  }

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form
  });
  const text = await r.text();
  if (!pub || !r.ok) return json(text, r.status);

  await env.WHOOP_HANDOFF.put(`done:${body.state}`, JSON.stringify(await sealFor(pub, text)), { expirationTtl: 900 });
  await env.WHOOP_HANDOFF.delete(`begin:${body.state}`);
  return json({ ok: true });
};
