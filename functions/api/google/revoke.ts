import { json, sameOrigin, type Ctx } from '../../../lib-functions/shared';

/** Отзыв доступа FemFora к Google */
export const onRequestPost = async ({ request }: Ctx) => {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (!body.token) return json({ error: 'bad_request' }, 400);
  const r = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: body.token })
  });
  return json({ ok: r.ok }, r.ok ? 200 : r.status);
};
