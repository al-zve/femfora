import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { setMood } from '../lib/actions';
import { addDays, dayNum, DOW_SHORT, dowIdx } from '../lib/dates';
import { GearIcon } from '../components/icons';
import { MoodPicker } from './Today';

export function Health({ today, openSettings }: { today: string; openSettings: () => void }) {
  const day = useLiveQuery(() => db.days.get(today), [today]);
  const week = useLiveQuery(() => db.days.where('date').between(addDays(today, -6), today, true, true).toArray(), [today]);
  const byDate = new Map((week ?? []).map((d) => [d.date, d.mood]));

  return (
    <div className="screen">
      <div className="header">
        <h1>Здоровье</h1>
        <button className="icon-btn" aria-label="Настройки" onClick={openSettings}>
          <GearIcon />
        </button>
      </div>

      <section className="section">
        <h2>Самочувствие</h2>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MoodPicker value={day?.mood} onPick={(n) => setMood(today, n)} />
        </div>
        <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, padding: '12px 8px' }}>
          {Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => {
            const m = byDate.get(d);
            return (
              <div key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span className="caption" style={{ fontSize: 12 }}>
                  {DOW_SHORT[dowIdx(d)]}
                </span>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    background: m ? 'var(--soft)' : 'transparent',
                    border: m ? 0 : '1.5px dashed var(--line)',
                    color: m ? 'var(--text)' : 'var(--muted)'
                  }}
                  aria-label={m ? `${dayNum(d)}: ${m} из 5` : `${dayNum(d)}: нет оценки`}
                >
                  {m ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h2>Прошлая ночь</h2>
        <div className="empty dashed" style={{ padding: 20, lineHeight: 1.4 }}>
          Recovery, сон, HRV и пульс появятся после подключения WHOOP
        </div>
      </section>

      <section className="section">
        <h2>Цикл</h2>
        <div className="empty dashed" style={{ padding: 20, lineHeight: 1.4 }}>
          Календарь цикла, прогноз и импорт из Maya появятся на следующем этапе
        </div>
      </section>
    </div>
  );
}
