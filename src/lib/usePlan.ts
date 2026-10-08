import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db';
import { BUDGET, dayCharge, zoneOf } from './battery';
import { type PlanCtx, buildLoads, phaseAdjustments } from './plan';
import { useCycle } from './useCycle';

/** Всё, что нужно плану дня: нагрузка по дням, бюджет сегодня, поправки по фазам. undefined — данные ещё читаются */
export function usePlan(today: string): PlanCtx | undefined {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const whoop = useLiveQuery(() => db.whoop.toArray(), []);
  const day = useLiveQuery(() => db.days.get(today), [today]);
  const model = useCycle();
  const adj = useMemo(() => (whoop ? phaseAdjustments(model, whoop) : {}), [model, whoop]);
  return useMemo(() => {
    if (!tasks || !whoop || model === undefined) return undefined;
    const charge = dayCharge(day?.mood, whoop.find((w) => w.date === today)?.recovery);
    return {
      today,
      todayBudget: charge != null ? BUDGET[zoneOf(charge)] : null,
      loads: buildLoads(tasks, today),
      model,
      adj
    };
  }, [tasks, whoop, day, model, adj, today]);
}
