import { json, sameOrigin, type Ctx } from '../../../lib-functions/shared';

const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

/**
 * Обмен кода на токены и обновление токенов.
 * Секрет приложения живёт только здесь; токены ничего не сохраняет, сразу отдаёт в браузер.
 */
export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) return json({ error: 'not_configured' }, 503);

  let body: { code?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const form = new URLSearchParams({ client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET });
  if (body.code) {
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
  return json(await r.text(), r.status);
};
