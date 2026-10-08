import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Energy } from '../db';
import { setSetting } from '../lib/actions';
import { CALIBRATION } from '../lib/estimate';
import type { CalibAnswers } from '../lib/useExamples';
import { BoltIcon } from './icons';

const LABELS: Record<Energy, string> = { 1: 'Лёгкая', 2: 'Средняя', 3: 'Тяжёлая' };

/** «Научить оценку»: ты выбираешь нагрузку для типичных задач, оценка потом ищет похожие */
export function Calibrate({ onBack }: { onBack: () => void }) {
  const answers = (useLiveQuery(() => db.settings.get('energy_calib'))?.value as CalibAnswers | undefined) ?? {};
  const [i, setI] = useState(() => {
    const first = CALIBRATION.findIndex((t) => !(t in answers));
    return first < 0 ? 0 : first;
  });
  const done = i >= CALIBRATION.length;
  const count = Object.keys(answers).filter((t) => CALIBRATION.includes(t)).length;
  const title = CALIBRATION[i];

  const answer = async (e: Energy) => {
    await setSetting('energy_calib', { ...answers, [title]: e });
    setI(i + 1);
  };

  if (done) {
    return (
      <>
        <div className="empty" style={{ padding: '24px 16px' }}>
          <b>Готово, спасибо!</b>
          <span>Ответов: {count} из {CALIBRATION.length}. «Оценить» теперь ищет похожие задачи среди них и среди твоих задач.</span>
        </div>
        <div className="grid2">
          <button className="btn btn-primary" onClick={onBack}>
            Готово
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await setSetting('energy_calib', {});
              setI(0);
            }}
          >
            Пройти заново
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
        Сколько сил у тебя обычно уходит на такую задачу? Ответы хранятся только на этом устройстве.
      </span>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--field)', border: 0 }}>
        <span className="caption">
          {i + 1} из {CALIBRATION.length}
        </span>
        <span key={title} className="drop" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3, minHeight: 52 }}>
          {title}
        </span>
        <div className="grid3">
          {([1, 2, 3] as Energy[]).map((e) => (
            <button
              key={e}
              className="chip"
              aria-pressed={answers[title] === e}
              style={{ height: 64, flexDirection: 'column', gap: 4, background: 'var(--surface)' }}
              onClick={() => answer(e)}
            >
              <span style={{ display: 'inline-flex', gap: 1 }}>
                {Array.from({ length: e }, (_, k) => (
                  <BoltIcon key={k} color="var(--bolt)" />
                ))}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{LABELS[e]}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn-text" style={{ color: 'var(--muted)' }} disabled={i === 0} onClick={() => setI(i - 1)}>
          Назад
        </button>
        <button className="btn-text" style={{ color: 'var(--muted)' }} onClick={() => setI(i + 1)}>
          Пропустить
        </button>
        <button className="btn-text" onClick={onBack}>
          Закончить
        </button>
      </div>
    </>
  );
}
