import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { cancelConnect, startConnect } from '../lib/whoop';
import { CheckIcon } from './icons';

/** Подключение WHOOP через ссылку, которую открывают в Safari */
export function WhoopConnect() {
  const pending = useLiveQuery(() => db.settings.get('whoop_pending'))?.value as { url: string; at: number } | undefined;
  const fresh = pending && Date.now() - pending.at < 15 * 60_000 ? pending : null;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!fresh) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await startConnect();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Готовлю ссылку…' : 'Подключить WHOOP'}
        </button>
        {error && <span className="error-text">{error}</span>}
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Не получилось скопировать. Нажми ещё раз.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="btn btn-primary" onClick={copy}>
        {copied ? (
          <>
            <CheckIcon size={18} /> Скопировано
          </>
        ) : (
          'Скопировать ссылку'
        )}
      </button>
      <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: 'var(--muted)' }}>
        <li>Открой Safari и вставь ссылку в адресную строку.</li>
        <li>Войди в WHOOP и нажми GRANT.</li>
        <li>Вернись сюда: через пару секунд здесь появится «обновлено», а во «Здоровье» — твои данные.</li>
      </ol>
      <span className="caption" style={{ fontWeight: 500 }}>
        Ссылка действует 15 минут
      </span>
      {error && <span className="error-text">{error}</span>}
      <button className="btn-text" style={{ color: 'var(--muted)', alignSelf: 'flex-start' }} onClick={() => cancelConnect()}>
        Отменить
      </button>
    </div>
  );
}
