/** Проверка и установка обновления приложения (PWA) */

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

/** Скачать новую версию и перезапустить приложение */
export async function applyUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) {
    const changed = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
      setTimeout(resolve, 8000);
    });
    try {
      await reg.update();
      if (reg.installing || reg.waiting) await changed;
    } catch {
      /* перезагрузимся в любом случае */
    }
  }
  location.reload();
}
