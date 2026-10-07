import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon } from './icons';

export function Sheet({
  title,
  onClose,
  headerExtra,
  doneLabel,
  children
}: {
  title: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  /** если задан — вместо крестика текстовая кнопка («Готово») */
  doneLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lined, setLined] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="scrim" role="presentation">
      <button className="scrim-hit" aria-label="Закрыть" onClick={onClose} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onScroll={(e) => setLined((e.target as HTMLDivElement).scrollTop > 4)}
      >
        <div className={`sheet-head${lined ? ' lined' : ''}`}>
          <div className="grabber" />
          <div className="sheet-title-row">
            <h2>{title}</h2>
            {headerExtra}
            {doneLabel ? (
              <button className="btn-text" style={{ fontSize: 16 }} onClick={onClose}>
                {doneLabel}
              </button>
            ) : (
              <button className="icon-btn" style={{ marginRight: -8 }} aria-label="Закрыть" onClick={onClose}>
                <CloseIcon />
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
