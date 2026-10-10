import { useEffect, useState } from 'react';
import { finishGoogle, syncGoogle } from '../lib/google';
import { CheckIcon } from './icons';

/** Сюда Google возвращает после входа — в любом окне и любом браузере */
export function GoogleCallback() {
  const [state, setState] = useState<'working' | 'connected' | 'handed' | 'error'>('working');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    history.replaceState(null, '', '/google/callback');
    (async () => {
      try {
        const here = await finishGoogle(params);
        if (here) {
          setState('connected');
          await syncGoogle().catch(() => undefined);
          if (window.opener) setTimeout(() => window.close(), 1200);
        } else {
          setState('handed');
        }
        try {
          new BroadcastChannel('femfora').postMessage('google-ready');
        } catch {
          /* не критично */
        }
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
      {state === 'working' && <h2>Подключаю Google…</h2>}
      {(state === 'connected' || state === 'handed') && (
        <>
          <span style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={26} style={{ color: 'var(--accent-text)' }} />
          </span>
          <h2>{state === 'connected' ? 'Google подключён' : 'Вход в Google выполнен'}</h2>
          <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45, maxWidth: 320 }}>
            {state === 'connected'
              ? 'Настраиваю напоминания и входящие'
              : 'Это окно можно закрыть. Вернись в FemFora с иконки на экране «Домой», и подключение завершится само. Сделай это в течение 15 минут.'}
          </span>
        </>
      )}
      {state === 'error' && (
        <>
          <h2>Не получилось подключить Google</h2>
          <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45, maxWidth: 320 }}>
            {error}
          </span>
        </>
      )}
      {state !== 'working' && state !== 'handed' && (
        <button className="btn btn-primary" style={{ minWidth: 220 }} onClick={back}>
          Вернуться в FemFora
        </button>
      )}
    </div>
  );
}
