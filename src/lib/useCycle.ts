import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import { DEFAULT_PERIOD, buildModel } from './cycle';

/** Модель цикла из локальных отметок. undefined, пока база не прочитана */
export function useCycle() {
  const periods = useLiveQuery(() => db.periods.toArray());
  const len = useLiveQuery(() => db.settings.get('period_len'));
  return useMemo(() => {
    if (!periods) return undefined;
    const periodLen = typeof len?.value === 'number' ? len.value : DEFAULT_PERIOD;
    return buildModel(
      periods.map((p) => p.start),
      periodLen
    );
  }, [periods, len]);
}
