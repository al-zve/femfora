import { json, sameOrigin, validState, type Ctx } from '../../../lib-functions/shared';

/** Приложение регистрирует начало входа: state и свой открытый ключ */
export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.WHOOP_HANDOFF) return json({ error: 'not_configured' }, 503);
  const body = (await request.json().catch(() => ({}))) as { state?: string; pub?: JsonWebKey };
  if (!validState(body.state) || !body.pub || body.pub.kty !== 'EC') return json({ error: 'bad_request' }, 400);
  await env.WHOOP_HANDOFF.put(`begin:${body.state}`, JSON.stringify(body.pub), { expirationTtl: 900 });
  return json({ ok: true });
};
