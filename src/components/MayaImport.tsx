import { useState } from 'react';
import { plural, shortDate } from '../lib/dates';
import { type ImportPlan, type MayaParsed, applyImport, parseMaya, planImport } from '../lib/maya';

/** Импорт истории месячных из Maya. Файл читается только на телефоне и никуда не отправляется */
export function MayaImport({ onBack, onNotice, periodLen }: { onBack: () => void; onNotice: (t: string) => void; periodLen: number }) {
  const [parsed, setParsed] = useState<MayaParsed | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [useLen, setUseLen] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    setParsed(null);
    setPlan(null);
    try {
      const p = parseMaya(await file.text());
      if (!p.periods.length) throw new Error('В файле не нашлось дат месячных');
      setParsed(p);
      setPlan(await planImport(p));
    } catch (e) {
      setError((e as Error).message || 'Не получилось прочитать файл');
    }
  };

  const lenDiffers = !!parsed?.periodLen && parsed.periodLen !== periodLen && parsed.periodLen >= 2 && parsed.periodLen <= 10;

  return (
    <>
      <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
        Выбери CSV-файл, который Maya прислала на почту (сохрани его в «Файлы»). Файл читается только на этом телефоне и никуда не отправляется.
      </span>
      <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4, marginTop: -8 }}>
        Берутся только даты месячных. Настроение, симптомы, заметки и всё остальное из файла приложение не читает и не сохраняет.
      </span>

      <label className="btn btn-secondary" style={{ position: 'relative', overflow: 'hidden' }}>
        {parsed ? 'Выбрать другой файл' : 'Выбрать файл'}
        <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => pick(e.target.files?.[0])} style={{ position: 'absolute', inset: 0, opacity: 0 }} />
      </label>

      {error && <span className="error-text">{error}</span>}

      {parsed && plan && (
        <div className="card drop" style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--field)', border: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            В файле {parsed.periods.length} {plural(parsed.periods.length, 'запись', 'записи', 'записей')} о месячных
          </span>
          <span className="sub" style={{ fontWeight: 500 }}>
            с {shortDate(parsed.periods[0].start)} {parsed.periods[0].start.slice(0, 4)} по {shortDate(parsed.periods[parsed.periods.length - 1].start)}{' '}
            {parsed.periods[parsed.periods.length - 1].start.slice(0, 4)}
          </span>
          <span className="sub" style={{ fontWeight: 500 }}>
            Новых: {plan.add.length}
            {plan.existing ? `, уже отмечены: ${plan.existing}` : ''}
          </span>
          {lenDiffers && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 600, minHeight: 44 }}>
              <input type="checkbox" checked={useLen} onChange={(e) => setUseLen(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
              Месячные по файлу длятся {parsed.periodLen} {plural(parsed.periodLen!, 'день', 'дня', 'дней')}, поставить так же
            </label>
          )}
        </div>
      )}

      <div className="grid2">
        <button
          className="btn btn-primary"
          disabled={busy || !plan || (plan.add.length === 0 && !(lenDiffers && useLen))}
          onClick={async () => {
            if (!plan || !parsed) return;
            setBusy(true);
            try {
              await applyImport(plan, lenDiffers && useLen ? parsed.periodLen : null);
              onNotice(plan.add.length ? `Добавлено ${plan.add.length} ${plural(plan.add.length, 'запись', 'записи', 'записей')} о месячных` : 'Длительность месячных обновлена');
              onBack();
            } finally {
              setBusy(false);
            }
          }}
        >
          Импортировать
        </button>
        <button className="btn btn-secondary" onClick={onBack}>
          Назад
        </button>
      </div>
    </>
  );
}
