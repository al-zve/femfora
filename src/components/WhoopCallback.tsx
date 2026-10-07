import { useEffect, useState } from 'react';
import { finishConnect, syncWhoop } from '../lib/whoop';
import { CheckIcon } from './icons';

/** Сюда WHOOP возвращает после входа: меняем код на токены и подтягиваем данные */
export function WhoopCallback() {
  const [state, setState] = useState<'working' | 'ok' | 'error'>('working');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    history.replaceState(null, '', '/whoop/callback');
    (async () => {
      try {
        await finishConnect(params);
        setState('ok');
        await syncWhoop(true).catch(() => undefined);
        try {
          new BroadcastChannel('femfora').postMessage('whoop-connected');
        } catch {
          /* не критично */
        }
        if (window.opener) setTimeout(() => window.close(), 1200);
      } catch (e) {
        setError((e as Error).message);
        setState('error');
      }
    })();
  }, []);

  const back = () => {
    if (window.opener) window.close();
    location.replace('/');
  };

  return (
    <div className="screen" style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 16 }}>
      {state === 'working' && <h2>Подключаю WHOOP…</h2>}
      {state === 'ok' && (
        <>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={26} style={{ color: 'var(--accent-text)' }} />
          </span>
          <h2>WHOOP подключён</h2>
          <span className="sub" style={{ fontWeight: 500 }}>
            Данные подтягиваются в FemFora
          </span>
        </>
      )}
      {state === 'error' && (
        <>
          <h2>Не получилось подключить WHOOP</h2>
          <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45, maxWidth: 320 }}>
            {error === 'STATE'
              ? 'Подключение открылось не в том окне. Открой FemFora с иконки на экране «Домой» и нажми «Подключить» ещё раз.'
              : error}
          </span>
        </>
      )}
      {state !== 'working' && (
        <button className="btn btn-primary" style={{ minWidth: 220 }} onClick={back}>
          Вернуться в FemFora
        </button>
      )}
    </div>
  );
}
