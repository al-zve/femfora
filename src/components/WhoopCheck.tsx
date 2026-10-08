import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { shortDate } from '../lib/dates';
import { type WhoopTrace, reloadWhoopHistory, whoopGaps } from '../lib/whoop';

const fmt = (s?: string) => {
  if (!s) return '—';
  const [d, t] = s.split(' ');
  return `${shortDate(d)}, ${t}`;
};

/** Проверка данных WHOOP: только время и привязка к дням, без показателей. Ничего не отправляется. */
export function WhoopCheck({ onBack, onNotice }: { onBack: () => void; onNotice: (t: string) => void }) {
  const trace = useLiveQuery(() => db.settings.get('whoop_trace'))?.value as { at: number; days: number; items: WhoopTrace[] } | undefined;
  const sync = useLiveQuery(() => db.settings.get('whoop_sync'));
  const gaps = useLiveQuery(() => whoopGaps(), [sync]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  return (
    <>
      <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
        Как ночи из WHOOP разложены по дням. День — это дата пробуждения. Если два цикла попали на одну дату, один сдвигается на соседний пустой день.
      </span>

      <div className="field">
        <span className="label">Дни без данных за 30 дней</span>
        <div className="inline-row" style={{ fontSize: 15, fontWeight: 700 }}>
          {gaps == null ? '…' : gaps.length ? gaps.map(shortDate).join(', ') : 'нет, всё на месте'}
        </div>
        {!!gaps?.length && (
          <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            Такие дни приложение само перезапрашивает раз в 6 часов. Если WHOOP за этот день тоже пустой, значит браслет не записал ночь.
          </span>
        )}
      </div>

      {trace && (
        <div className="field">
          <span className="label">Последние циклы</span>
          <div className="list-box">
            {[...trace.items].reverse().map((t) => (
              <div key={t.cycleStart} className="list-row" style={{ alignItems: 'flex-start', padding: '10px 0', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <b style={{ fontWeight: 800 }}>{t.date ? shortDate(t.date) : 'не учтён'}</b>
                  <span className="caption">
                    {[t.recovery && 'recovery', t.sleep && 'сон', t.moved && 'сдвинут'].filter(Boolean).join(' · ') || 'без оценки'}
                  </span>
                </span>
                <span className="caption" style={{ fontWeight: 500 }}>
                  засыпание {fmt(t.cycleStart)} · пробуждение {fmt(t.wake)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <span className="error-text">{err}</span>}
      <div className="grid2">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              await reloadWhoopHistory();
              onNotice('История WHOOP загружена заново');
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Загружаю…' : 'Обновить всё'}
        </button>
        <button className="btn btn-secondary" onClick={onBack}>
          Назад
        </button>
      </div>
    </>
  );
}
