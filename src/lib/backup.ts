import { db } from '../db';

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportBackup(password: string) {
  const payload = {
    app: 'femfora',
    v: 1,
    at: new Date().toISOString(),
    tasks: await db.tasks.toArray(),
    moves: await db.moves.toArray(),
    days: await db.days.toArray(),
    // ключи WHOOP и Google в копию не кладём: после восстановления их подключают заново
    settings: (await db.settings.toArray()).filter((x) => !x.key.startsWith('whoop_') && !x.key.startsWith('google_')),
    whoop: await db.whoop.toArray(),
    periods: await db.periods.toArray()
  };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
  const file = JSON.stringify({ femfora: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(data) });
  const blob = new Blob([file], { type: 'application/json' });
  const name = `femfora-${payload.at.slice(0, 10)}.femfora`;
  const shareFile = new File([blob], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare && nav.canShare({ files: [shareFile] })) {
    await navigator.share({ files: [shareFile], title: 'FemFora: резервная копия' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file: File, password: string) {
  const wrap = JSON.parse(await file.text());
  if (!wrap || wrap.femfora !== 1) throw new Error('Это не файл резервной копии FemFora');
  const key = await deriveKey(password, fromB64(wrap.salt));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(wrap.iv) as BufferSource }, key, fromB64(wrap.data) as BufferSource);
  } catch {
    throw new Error('Неверный пароль');
  }
  return JSON.parse(dec.decode(plain));
}

export async function restoreBackup(payload: Awaited<ReturnType<typeof readBackup>>) {
  await db.transaction('rw', [db.tasks, db.moves, db.days, db.settings, db.whoop, db.periods], async () => {
    await Promise.all([db.tasks.clear(), db.moves.clear(), db.days.clear(), db.settings.clear(), db.whoop.clear(), db.periods.clear()]);
    await db.tasks.bulkAdd(payload.tasks ?? []);
    await db.moves.bulkAdd(payload.moves ?? []);
    await db.days.bulkAdd(payload.days ?? []);
    await db.settings.bulkAdd((payload.settings ?? []).filter((x: { key: string }) => !x.key.startsWith('whoop_') && !x.key.startsWith('google_')));
    await db.whoop.bulkAdd(payload.whoop ?? []);
    await db.periods.bulkAdd(payload.periods ?? []);
  });
}
