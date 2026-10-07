export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  WHOOP_CLIENT_ID: string;
  WHOOP_CLIENT_SECRET: string;
  /** временная передача результата входа в приложение, записи живут 15 минут */
  WHOOP_HANDOFF: KV;
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

export const validState = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9]{8}$/.test(s);

const b64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** Шифруем токены открытым ключом приложения (ECDH P-256 + AES-GCM): прочитать их может только оно */
export async function sealFor(pubJwk: JsonWebKey, plaintext: string) {
  const pub = await crypto.subtle.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])) as CryptoKeyPair;
  const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, eph.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { epk: await crypto.subtle.exportKey('jwk', eph.publicKey), iv: b64(iv.buffer), data: b64(data) };
}
