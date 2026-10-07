export interface Env {
  WHOOP_CLIENT_ID: string;
  WHOOP_CLIENT_SECRET: string;
}

export interface Ctx {
  request: Request;
  env: Env;
}

export const json = (data: unknown, status = 200) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

/** Принимаем запросы только со своего же сайта */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
