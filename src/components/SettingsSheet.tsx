import { useState } from 'react';
import { setSetting } from '../lib/actions';
import { exportBackup, readBackup, restoreBackup } from '../lib/backup';
import { Sheet } from './Sheet';
import { ChevronRight } from './icons';

export type ThemePref = 'light' | 'dark' | 'system';

export function SettingsSheet({ theme, onClose, onNotice }: { theme: ThemePref; onClose: () => void; onNotice: (t: string) => void }) {
  const [mode, setMode] = useState<'menu' | 'export' | 'import'>('menu');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMode('menu');
    setPw('');
    setPw2('');
    setFile(null);
    setError('');
  };

  const doExport = async () => {
    if (pw.length < 8) return setError('Пароль минимум 8 символов');
    if (pw !== pw2) return setError('Пароли не совпадают');
    setBusy(true);
    setError('');
    try {
      await exportBackup(pw);
      onNotice('Резервная копия сохранена');
      reset();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Не получилось сохранить файл');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (!file) return setError('Выбери файл копии');
    setBusy(true);
    setError('');
    try {
      const data = await readBackup(file, pw);
      await restoreBackup(data);
      onNotice('Данные восстановлены');
      reset();
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Не получилось прочитать файл');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Настройки" onClose={onClose}>
      {mode === 'menu' && (
        <>
          <div className="field">
            <span className="label">Тема</span>
            <div className="seg">
              {(
                [
                  ['light', 'Светлая'],
                  ['dark', 'Тёмная'],
                  ['system', 'Авто']
                ] as [ThemePref, string][]
              ).map(([v, l]) => (
                <button key={v} aria-pressed={theme === v} onClick={() => setSetting('theme', v)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Подключения</span>
            <div className="list-box">
              <div className="list-row">
                WHOOP <span className="val">скоро</span>
              </div>
              <div className="list-row">
                Google Календарь <span className="val">скоро</span>
              </div>
            </div>
          </div>

          <div className="field">
            <span className="label">Данные</span>
            <div className="list-box">
              <button className="list-row" onClick={() => setMode('export')}>
                Сохранить резервную копию <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
              </button>
              <button className="list-row" onClick={() => setMode('import')}>
                Восстановить из копии <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
              Все данные хранятся только на этом устройстве. Копия шифруется твоим паролем, без него её не открыть.
            </span>
          </div>
        </>
      )}

      {mode === 'export' && (
        <>
          <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
            Придумай пароль для копии и сохрани файл в «Файлы» или iCloud Drive. Пароль нигде не хранится: если его забыть, копию не открыть.
          </span>
          <div className="field">
            <label htmlFor="bk-pw">Пароль</label>
            <input id="bk-pw" type="password" className="input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bk-pw2">Ещё раз</label>
            <input id="bk-pw2" type="password" className="input" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          {error && <span className="error-text">{error}</span>}
          <div className="grid2">
            <button className="btn btn-primary" disabled={busy} onClick={doExport}>
              Сохранить
            </button>
            <button className="btn btn-secondary" onClick={reset}>
              Назад
            </button>
          </div>
        </>
      )}

      {mode === 'import' && (
        <>
          <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
            Данные на этом устройстве заменятся данными из копии.
          </span>
          <label className="btn btn-secondary" style={{ position: 'relative', overflow: 'hidden' }}>
            {file ? file.name : 'Выбрать файл'}
            <input
              type="file"
              accept=".femfora,application/json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
            />
          </label>
          <div className="field">
            <label htmlFor="rs-pw">Пароль копии</label>
            <input id="rs-pw" type="password" className="input" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {error && <span className="error-text">{error}</span>}
          <div className="grid2">
            <button className="btn btn-primary" disabled={busy || !file || !pw} onClick={doImport}>
              Восстановить
            </button>
            <button className="btn btn-secondary" onClick={reset}>
              Назад
            </button>
          </div>
        </>
      )}

      <span className="caption" style={{ textAlign: 'center', fontWeight: 500 }}>
        FemFora {__APP_VERSION__}
      </span>
    </Sheet>
  );
}
