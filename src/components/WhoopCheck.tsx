import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '../db';
import { addDays, shortDate } from '../lib/dates';
import { type WhoopTrace, type WhoopTraceInfo, reloadWhoopHistory, whoopGaps } from '../lib/whoop';
import { ChevronDown } from './icons';

const fmt = (s?: string) => {
  if (!s) return '—';
  const [d, t] = s.split(' ');
  return `${shortDate(d)}, ${t}`;
};
const STATE: Record<string, string> = { SCORED: 'есть', PENDING_SCORE: 'ждёт оценки', UNSCORABLE: 'не оценён', PENDING_MANUAL: 'ждёт оценки' };
const st = (s?: string) => (s ? (STATE[s] ?? s.toLowerCase()) : 'нет');

function Row({ t, hl }: { t: WhoopTrace; hl?: boolean }) {
  return (
    <div className="list-row" style={{ alignItems: 'flex-start', padding: '10px 0', flexDirection: 'column', gap: 2 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
        <b style={{ fontWeight: 800, color: hl ? 'var(--accent-text)' : undefined }}>{t.date ? shortDate(t.date) : 'не учтён'}</b>
        <span className="caption">{t.moved && t.wanted ? `сдвинут с ${shortDate(t.wanted)}` : ''}</span>
      </span>
      <span className="caption" style={{ fontWeight: 500 }}>
        засыпание {fmt(t.cycleStart)} · пробуждение {fmt(t.wake)}
      </span>
      <span className="caption" style={{ fontWeight: 500 }}>
        recovery: {st(t.recState)} · сон: {st(t.sleepState)}
        {t.naps ? ` · дневной сон: ${t.naps}` : ''}
        {t.cycleEnd ? '' : ' · цикл ещё идёт'}
      </span>
    </div>
  );
}

/** Проверка данных WHOOP: только время, статусы и привязка к дням, без показателей. Ничего не отправляется. */
export function WhoopCheck({ onBack, onNotice }: { onBack: () => void; onNotice: (t: string) => void }) {
  const trace = useLiveQuery(() => db.settings.get('whoop_trace'))?.value as WhoopTraceInfo | undefined;
  const sync = useLiveQuery(() => db.settings.get('whoop_sync'));
  const gaps = useLiveQuery(() => whoopGaps(), [sync]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);
  const items = trace?.items ?? [];

  // циклы рядом с пустым днём: по засыпанию, пробуждению или привязке ±1 день
  const near = (g: string) =>
    items.filter((t) => [t.date, t.wanted, t.cycleStart.slice(0, 10), t.wake?.slice(0, 10)].some((d) => d && d >= addDays(g, -1) && d <= addDays(g, 1)));

  return (
    <>
      <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
        Как ночи из WHOOP разложены по дням. День — это дата пробуждения. Здесь только время и статусы, без показателей.
      </span>

      {trace?.counts && (
        <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
          Последняя полная загрузка: циклов {trace.counts.cycles}, recovery {trace.counts.recoveries}, ночных снов {trace.counts.sleeps}, дневных {trace.counts.naps}
          {trace.counts.orphanSleeps ? `, снов без цикла ${trace.counts.orphanSleeps}` : ''}
        </span>
      )}

      <div className="field">
        <span className="label">Дни без данных</span>
        {gaps == null ? (
          <div className="inline-row">…</div>
        ) : gaps.length === 0 ? (
          <div className="inline-row" style={{ fontSize: 15, fontWeight: 700 }}>
            нет, всё на месте
          </div>
        ) : (
          gaps.map((g) => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 800, paddingTop: 4 }}>{shortDate(g)} — что прислал WHOOP рядом:</span>
              <div className="list-box">
                {near(g).length ? near(g).map((t) => <Row key={t.cycleStart} t={t} hl={t.date === g || t.wanted === g} />) : <div className="list-row caption">циклов рядом нет</div>}
              </div>
            </div>
          ))
        )}
      </div>

      <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4, marginTop: -8 }}>
        Приложение само загружает историю заново раз в сутки и сразу, как находит пустой день. Если день остаётся пустым, значит, WHOOP за него ничего не прислал.
      </span>

      {items.length > 0 && (
        <div className="field">
          <button className="done-toggle" aria-expanded={all} onClick={() => setAll(!all)}>
            Все циклы · {items.length}
            <ChevronDown size={16} className={`chev${all ? ' open' : ''}`} />
          </button>
          {all && (
            <div className="list-box drop">
              {[...items].reverse().map((t) => (
                <Row key={t.cycleStart} t={t} />
              ))}
            </div>
          )}
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
