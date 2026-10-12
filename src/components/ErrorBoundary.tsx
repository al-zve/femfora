import { Component, type ReactNode } from 'react';
import { applyUpdate } from '../lib/update';

/** Если что-то сломалось при отрисовке — вместо белого экрана объяснение, текст ошибки и кнопки */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="screen" style={{ minHeight: '100dvh', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        <h2>Что-то пошло не так</h2>
        <span className="sub" style={{ fontWeight: 500, lineHeight: 1.45, maxWidth: 320 }}>
          Твои задачи и данные на месте. Попробуй перезапустить приложение. Если не поможет, пришли скриншот этого экрана.
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Перезапустить
          </button>
          <button className="btn btn-secondary" onClick={() => applyUpdate()}>
            Загрузить заново с сервера
          </button>
        </div>
        <code className="caption" style={{ fontWeight: 500, maxWidth: 340, wordBreak: 'break-word' }}>
          {__APP_VERSION__} · {error.message}
          {error.stack ? ` · ${error.stack.split('\n').slice(1, 3).join(' ').trim()}` : ''}
        </code>
      </div>
    );
  }
}
