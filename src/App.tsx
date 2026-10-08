import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from './db';
import { todayKey } from './lib/dates';
import { Today } from './screens/Today';
import { TasksScreen } from './screens/TasksScreen';
import { Health } from './screens/Health';
import { AddSheet } from './components/AddSheet';
import { TaskSheet } from './components/TaskSheet';
import { SettingsSheet, type ThemePref } from './components/SettingsSheet';
import { CheckIcon, PlusIcon } from './components/icons';
import { WhoopCallback } from './components/WhoopCallback';
import { CycleSheet } from './components/CycleSheet';
import { claimPending, getPending, syncWhoop } from './lib/whoop';

type Tab = 'today' | 'tasks' | 'health';
type SheetState = { kind: 'add' } | { kind: 'task'; id: string } | { kind: 'settings' } | { kind: 'cycle' } | null;

function useToday() {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const tick = () => setToday(todayKey());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return today;
}

function useTheme(): ThemePref {
  const pref = (useLiveQuery(() => db.settings.get('theme'))?.value as ThemePref | undefined) ?? 'system';
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#131015' : '#FBF6F8');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
  return pref;
}

function useWhoopSync() {
  const pending = useLiveQuery(() => db.settings.get('whoop_pending'));
  const hasPending = !!pending;

  useEffect(() => {
    const run = () => document.visibilityState === 'visible' && syncWhoop().catch(() => undefined);
    run();
    document.addEventListener('visibilitychange', run);
    return () => document.removeEventListener('visibilitychange', run);
  }, []);

  // пока идёт вход в WHOOP, каждые 3 секунды спрашиваем сервер, готов ли результат
  useEffect(() => {
    if (!hasPending) return;
    let stop = false;
    const tick = async () => {
      if (stop || document.visibilityState !== 'visible') return;
      try {
        if (!(await getPending())) return;
        if (await claimPending()) await syncWhoop(true);
      } catch {
        /* попробуем на следующем шаге */
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    document.addEventListener('visibilitychange', tick);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('femfora');
      ch.onmessage = () => tick();
    } catch {
      /* старые браузеры */
    }
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      ch?.close();
    };
  }, [hasPending]);
}

export default function App() {
  if (location.pathname === '/whoop/callback') return <WhoopCallback />;
  return <Main />;
}

function Main() {
  useWhoopSync();
  const today = useToday();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>('today');
  const [selected, setSelected] = useState(today);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const toastTimer = useRef<number>(0);

  const notify = useCallback((text: string) => {
    clearTimeout(toastTimer.current);
    setToast((t) => ({ text, n: (t?.n ?? 0) + 1 }));
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  const close = useCallback(() => setSheet(null), []);
  const openTask = useCallback((id: string) => setSheet({ kind: 'task', id }), []);
  const openSettings = useCallback(() => setSheet({ kind: 'settings' }), []);
  const openCycle = useCallback(() => setSheet({ kind: 'cycle' }), []);
  const goTab = (v: Tab) => {
    setTab(v);
    if (v === 'tasks' && tab !== 'tasks') setSelected(today);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      {tab === 'today' && <Today today={today} openTask={openTask} openSettings={openSettings} openCycle={openCycle} notify={notify} />}
      {tab === 'tasks' && <TasksScreen today={today} selected={selected} onSelect={setSelected} openTask={openTask} openSettings={openSettings} />}
      {tab === 'health' && <Health today={today} openSettings={openSettings} openCycle={openCycle} notify={notify} />}

      {toast && (
        <div className="toast-wrap" role="status" aria-live="polite">
          <span className="toast" key={toast.n}>
            <CheckIcon size={16} style={{ color: 'var(--toast-icon)' }} />
            {toast.text}
          </span>
        </div>
      )}

      <nav className="nav" aria-label="Разделы">
        <div className="tabs">
          {(
            [
              ['today', 'Сегодня'],
              ['tasks', 'Задачи'],
              ['health', 'Здоровье']
            ] as [Tab, string][]
          ).map(([v, l]) => (
            <button
              key={v}
              aria-current={tab === v ? 'page' : undefined}
              onClick={() => goTab(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="fab" aria-label="Добавить задачу" onClick={() => setSheet({ kind: 'add' })}>
          <PlusIcon />
        </button>
      </nav>

      {sheet?.kind === 'add' && <AddSheet today={today} defaultDate={tab === 'tasks' && selected >= today ? selected : today} onClose={close} />}
      {sheet?.kind === 'task' && <TaskSheet id={sheet.id} today={today} onClose={close} onNotice={notify} />}
      {sheet?.kind === 'cycle' && (
        <CycleSheet
          today={today}
          onClose={close}
          onNotice={notify}
          onCalendar={() => {
            close();
            setTab('health');
            // календарь цикла в разделе «Здоровье»
            setTimeout(() => document.getElementById('cycle')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);
          }}
        />
      )}
      {sheet?.kind === 'settings' && <SettingsSheet theme={theme} onClose={close} onNotice={notify} />}
    </div>
  );
}
