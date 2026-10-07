import type { Energy } from '../db';
import { BoltIcon } from './icons';

const WORD = ['', 'лёгкая', 'средняя', 'тяжёлая'];

export function Bolts({ n, size = 14 }: { n: Energy; size?: number }) {
  return (
    <span className="bolts" role="img" aria-label={`Нагрузка: ${WORD[n]}`}>
      {[1, 2, 3].map((i) => (
        <BoltIcon key={i} size={size} color={i <= n ? 'var(--bolt)' : 'var(--bolt-off)'} />
      ))}
    </span>
  );
}

/** число с молнией: «6⚡» */
export function Load({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {n}
      <BoltIcon size={size} color="var(--bolt)" />
    </span>
  );
}
