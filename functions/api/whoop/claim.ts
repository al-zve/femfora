import { json, sameOrigin, validState, type Ctx } from '../../../lib-functions/shared';

/** Приложение забирает зашифрованный результат входа; запись сразу удаляется */
export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  if (!env.WHOOP_HANDOFF) return json({ error: 'not_configured' }, 503);
  const body = (await request.json().catch(() => ({}))) as { state?: string };
  if (!validState(body.state)) return json({ error: 'bad_request' }, 400);
  const sealed = await env.WHOOP_HANDOFF.get(`done:${body.state}`);
  if (!sealed) return json({ pending: true }, 202);
  await env.WHOOP_HANDOFF.delete(`done:${body.state}`);
  return json(sealed);
};
