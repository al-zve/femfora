import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { applyUpdate, isNewer, serverVersion } from '../lib/update';
import { db } from '../db';
import { disconnectWhoop, syncWhoop } from '../lib/whoop';
import { WhoopConnect } from './WhoopConnect';
import { WhoopCheck } from './WhoopCheck';
import { Calibrate } from './Calibrate';
import { MayaImport } from './MayaImport';
import { CALIBRATION } from '../lib/estimate';
import { setSetting } from '../lib/actions';
import { exportBackup, readBackup, restoreBackup } from '../lib/backup';
import { Sheet } from './Sheet';
import { ChevronRight } from './icons';
import { DEFAULT_PERIOD } from '../lib/cycle';
import { plural } from '../lib/dates';

export type ThemePref = 'light' | 'dark' | 'system';

export function SettingsSheet({ theme, onClose, onNotice }: { theme: ThemePref; onClose: () => void; onNotice: (t: string) => void }) {
  const [mode, setMode] = useState<'menu' | 'export' | 'import' | 'whoop' | 'calib' | 'maya'>('menu');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const whoopAuth = useLiveQuery(() => db.settings.get('whoop_auth'));
  const whoopSync = useLiveQuery(() => db.settings.get('whoop_sync'));
  const whoopError = useLiveQuery(() => db.settings.get('whoop_error'));
  const calib = useLiveQuery(() => db.settings.get('energy_calib'))?.value as Record<string, number> | undefined;
  const calibCount = Object.keys(calib ?? {}).filter((t) => CALIBRATION.includes(t)).length;
  const periodSetting = useLiveQuery(() => db.settings.get('period_len'));
  const periodLen = typeof periodSetting?.value === 'number' ? periodSetting.value : DEFAULT_PERIOD;

  const [whoopMsg, setWhoopMsg] = useState('');
  const [remote, setRemote] = useState<string | null | undefined>(undefined);
  const [updating, setUpdating] = useState(false);
  const check = () => {
    setRemote(undefined);
    // короткая пауза, чтобы было видно, что проверка прошла
    Promise.all([serverVersion(), new Promise((r) => setTimeout(r, 500))]).then(([v]) => setRemote(v));
  };
  useEffect(check, []);
  const hasUpdate = !!remote && isNewer(remote, __APP_VERSION__);
  const syncedAt = (whoopSync?.value as { at: number } | undefined)?.at;

  const reset = () => {
    setMode('menu');
    setPw('');
    setPw2('');
    setFile(null);
    setError('');
  };

  const doExport = async () => {
    if (pw.length < 8) return setError('Пароль должен быть не короче 8 символов');
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
    <Sheet title={mode === 'whoop' ? 'Данные WHOOP' : mode === 'calib' ? 'Настроить оценку' : mode === 'maya' ? 'Импорт из Maya' : 'Настройки'} onClose={onClose}>
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
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  WHOOP
                  {whoopAuth && (
                    <span className="caption" style={{ fontWeight: 500 }}>
                      {syncedAt ? `обновлено в ${new Date(syncedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'подключён'}
                    </span>
                  )}
                  {!whoopAuth && whoopError && (
                    <span className="caption" style={{ fontWeight: 500 }}>
                      нужно войти заново
                    </span>
                  )}
                </span>
                {whoopAuth ? (
                  <span style={{ display: 'flex', gap: 14 }}>
                    <button
                      className="btn-text"
                      onClick={() => {
                        setWhoopMsg('');
                        syncWhoop(true).catch((e) => setWhoopMsg((e as Error).message));
                      }}
                    >
                      Обновить
                    </button>
                    <button className="btn-text" style={{ color: 'var(--muted)' }} onClick={() => disconnectWhoop()}>
                      Отключить
                    </button>
                  </span>
                ) : null}
              </div>
              {whoopAuth && (
                <button className="list-row" onClick={() => setMode('whoop')}>
                  Проверка данных WHOOP <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
                </button>
              )}
              {!whoopAuth && (
                <div style={{ padding: '4px 0 14px', borderBottom: '1px solid var(--line)' }}>
                  <WhoopConnect />
                </div>
              )}
              <div className="list-row">
                Google Календарь <span className="val">скоро</span>
              </div>
            </div>
            {whoopMsg && <span className="error-text">{whoopMsg}</span>}
          </div>

          <div className="field">
            <span className="label">Оценка нагрузки</span>
            <div className="list-box">
              <button className="list-row" onClick={() => setMode('calib')}>
                Настроить оценку
                <span className="val" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {calibCount ? `${calibCount} из ${CALIBRATION.length}` : 'не пройдено'}
                  <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
                </span>
              </button>
            </div>
          </div>

          <div className="field">
            <span className="label">Цикл</span>
            <div className="list-box">
              <div className="list-row">
                Месячные длятся
                <span className="stepper">
                  <button aria-label="Меньше" disabled={periodLen <= 2} onClick={() => setSetting('period_len', periodLen - 1)}>
                    −
                  </button>
                  <output aria-live="polite">
                    {periodLen} {plural(periodLen, 'день', 'дня', 'дней')}
                  </output>
                  <button aria-label="Больше" disabled={periodLen >= 10} onClick={() => setSetting('period_len', periodLen + 1)}>
                    +
                  </button>
                </span>
              </div>
              <button className="list-row" onClick={() => setMode('maya')}>
                Импорт из Maya <ChevronRight size={18} style={{ color: 'var(--muted)' }} />
              </button>
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

      {mode === 'whoop' && <WhoopCheck onBack={reset} onNotice={onNotice} />}
      {mode === 'calib' && <Calibrate onBack={reset} />}
      {mode === 'maya' && <MayaImport onBack={reset} onNotice={onNotice} periodLen={periodLen} />}

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
            <label htmlFor="bk-pw2">Повтори пароль</label>
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

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span className="caption" style={{ fontWeight: 500 }}>
          FemFora {__APP_VERSION__}
          {remote === undefined ? '' : remote === null ? ' · нет связи с сервером' : hasUpdate ? ` · есть ${remote}` : ' · последняя версия'}
        </span>
        {/* кнопка всегда на месте, чтобы окно не прыгало во время проверки */}
        <button
          className="btn-text"
          disabled={remote === undefined || updating}
          style={hasUpdate ? undefined : { color: 'var(--muted)' }}
          onClick={() => {
            if (hasUpdate) {
              setUpdating(true);
              applyUpdate();
            } else check();
          }}
        >
          {updating ? 'Обновляю…' : remote === undefined ? 'Проверяю…' : hasUpdate ? `Обновить до ${remote}` : 'Проверить ещё раз'}
        </button>
      </div>
    </Sheet>
  );
}
