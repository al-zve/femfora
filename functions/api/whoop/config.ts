import { json, type Ctx } from '../../../lib-functions/shared';

/** Client ID не секретный: он всё равно виден в ссылке авторизации */
export const onRequestGet = async ({ env }: Ctx) => {
  if (!env.WHOOP_CLIENT_ID) return json({ error: 'not_configured' }, 503);
  return json({ clientId: env.WHOOP_CLIENT_ID });
};
