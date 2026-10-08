/**
 * Обновление приложения (PWA).
 * Автоматически: при каждом возвращении в приложение проверяем sw.js; когда новая версия
 * берёт управление, перезагружаемся — но не посреди открытой шторки (чтобы не потерять ввод).
 * По кнопке: «жёсткое» обновление — снимаем service worker, чистим его кеш и загружаем
 * страницу с сервера. Данные (IndexedDB) это не затрагивает.
 */

const parse = (v: string) => v.split('.').map((n) => Number(n) || 0);
export const isNewer = (a: string, b: string) => {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** Версия на сервере или null, если не получилось узнать */
export async function serverVersion(): Promise<string | null> {
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { version?: string };
    return j.version ?? null;
  } catch {
    return null;
  }
}

let openSheets = 0;
let pendingReload = false;

const reloadIfIdle = () => {
  if (pendingReload && openSheets === 0) location.reload();
};

/** Шторка открыта — автоматическую перезагрузку откладываем до её закрытия */
export function sheetOpened() {
  openSheets++;
  return () => {
    openSheets = Math.max(0, openSheets - 1);
    reloadIfIdle();
  };
}

export function initUpdates() {
  const sw = navigator.serviceWorker;
  // убираем служебный параметр после жёсткого обновления
  if (location.search.includes('u=')) history.replaceState(null, '', location.pathname);
  if (!sw) return;
  let hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true; // первая установка — перезагружать незачем
      return;
    }
    pendingReload = true;
    reloadIfIdle();
  });
  const check = () => {
    if (document.visibilityState !== 'visible') return;
    sw.getRegistration()
      .then((r) => r?.update())
      .catch(() => undefined);
  };
  document.addEventListener('visibilitychange', check);
  window.setInterval(check, 30 * 60_000);
}

/** Гарантированно загрузить свежую версию с сервера */
export async function applyUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* всё равно перезагружаемся */
  }
  location.replace(`/?u=${Date.now()}`);
}
