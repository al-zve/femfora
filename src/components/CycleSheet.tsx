import { useState, type ReactNode } from 'react';
import { PHASE_TEXT, SOURCES, dayInfo, nextStart } from '../lib/cycle';
import { markPeriodStart } from '../lib/actions';
import { plural, shortDate } from '../lib/dates';
import { useCycle } from '../lib/useCycle';
import { Sheet } from './Sheet';
import { ChevronDown } from './icons';

/** «текст [1] текст» → номера источников мелким серым */
export function Cited({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(/(\[\d\])/).map((p, i) =>
    /^\[\d\]$/.test(p) ? (
      <span key={i} className="cite">
        {p}
      </span>
    ) : (
      p
    )
  );
  return <>{parts}</>;
}

export function Sources() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button className="done-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Источники
        <ChevronDown size={16} className={`chev${open ? ' open' : ''}`} />
      </button>
      {open && (
        <ol className="sources drop">
          {SOURCES.map((s) => (
            <li key={s.n}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.text}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function CycleSheet({
  today,
  onClose,
  onCalendar,
  onNotice
}: {
  today: string;
  onClose: () => void;
  onCalendar: () => void;
  onNotice: (t: string) => void;
}) {
  const model = useCycle();
  const info = model ? dayInfo(model, today) : null;

  if (!model || !info) {
    return (
      <Sheet title="Цикл" onClose={onClose}>
        <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45 }}>
          Отметь первый день последних месячных, и здесь появятся день цикла и фаза.
        </span>
        <button className="btn btn-secondary" onClick={onCalendar}>
          Открыть календарь
        </button>
      </Sheet>
    );
  }

  const t = PHASE_TEXT[info.phase];
  const canMarkToday = info.day > model.periodLen;
  const sections: [string, string][] = [
    ['Нагрузка и задачи', t.tasks],
    ['Спорт', t.sport],
    ['Еда', t.food],
    ['Сон', t.sleep]
  ];

  return (
    <Sheet title={`Цикл, день ${info.day}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 18, fontWeight: 800 }}>{t.title}</span>
        <span className="sub" style={{ fontWeight: 500, fontSize: 15, lineHeight: 1.45 }}>
          <Cited text={t.about} />
        </span>
      </div>

      {info.lateBy > 0 && (
        <div className="proposal" style={{ padding: '12px 16px', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
          Месячные ожидались ≈ {shortDate(nextStart(model)!)}, задержка {info.lateBy} {plural(info.lateBy, 'день', 'дня', 'дней')}. Если они начались, отметь день в календаре.
        </div>
      )}

      <div className="list-box">
        {sections.map(([label, text]) => (
          <div key={label} className="advice">
            <span className="caption">{label}</span>
            <span>
              <Cited text={text} />
            </span>
          </div>
        ))}
      </div>

      <span className="caption" style={{ fontWeight: 500, lineHeight: 1.4 }}>
        Фаза посчитана по календарю, поэтому она приблизительная. Это общие данные исследований, а не медицинская рекомендация.
      </span>

      <Sources />

      <div className={canMarkToday ? 'grid2' : undefined} style={canMarkToday ? undefined : { display: 'flex' }}>
        {canMarkToday && (
          <button
            className="btn btn-primary"
            onClick={async () => {
              await markPeriodStart(today);
              onNotice('Отмечено: месячные начались сегодня');
              onClose();
            }}
          >
            Начались сегодня
          </button>
        )}
        <button className="btn btn-secondary" style={canMarkToday ? undefined : { flex: 1 }} onClick={onCalendar}>
          Календарь
        </button>
      </div>
    </Sheet>
  );
}
