import { addDays, daysBetween } from './dates';

export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export const PHASE_NAME: Record<Phase, string> = {
  menstrual: 'менструальная',
  follicular: 'фолликулярная',
  ovulatory: 'овуляторная',
  luteal: 'лютеиновая'
};
export const PHASE_SHORT: Record<Phase, string> = { menstrual: 'М', follicular: 'Ф', ovulatory: 'О', luteal: 'Л' };

export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
/** лютеиновая фаза в среднем около 14 дней, поэтому овуляцию считаем за 14 дней до следующих месячных */
const LUTEAL_DAYS = 14;

export interface CycleModel {
  starts: string[];
  /** длины завершённых циклов, от старых к новым */
  lengths: { start: string; len: number }[];
  avgLen: number;
  periodLen: number;
}

export function buildModel(startsRaw: string[], periodLen = DEFAULT_PERIOD): CycleModel {
  const starts = [...startsRaw].sort();
  const lengths: { start: string; len: number }[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = daysBetween(starts[i - 1], starts[i]);
    // слишком короткие и слишком длинные промежутки — скорее пропущенная отметка, в среднее не берём
    if (len >= 15 && len <= 60) lengths.push({ start: starts[i - 1], len });
  }
  const recent = lengths.slice(-6);
  const avgLen = recent.length ? Math.round(recent.reduce((s, x) => s + x.len, 0) / recent.length) : DEFAULT_CYCLE;
  return { starts, lengths, avgLen, periodLen };
}

export interface DayInfo {
  day: number;
  phase: Phase;
  cycleStart: string;
  cycleLen: number;
  /** цикл ещё идёт и уже дольше обычного */
  lateBy: number;
}

/** Фаза и день цикла для даты. null, если данных нет или последняя отметка слишком давно */
export function dayInfo(m: CycleModel, date: string): DayInfo | null {
  let idx = -1;
  for (let i = m.starts.length - 1; i >= 0; i--) {
    if (m.starts[i] <= date) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const start = m.starts[idx];
  const next = m.starts[idx + 1];
  const day = daysBetween(start, date) + 1;
  const closedLen = next ? daysBetween(start, next) : null;
  const cycleLen = closedLen && closedLen >= 15 && closedLen <= 60 ? closedLen : m.avgLen;
  if (!next && day > m.avgLen + 30) return null;
  const ovDay = cycleLen - LUTEAL_DAYS;
  let phase: Phase;
  if (day <= m.periodLen) phase = 'menstrual';
  else if (day < ovDay - 1) phase = 'follicular';
  else if (day <= ovDay + 1) phase = 'ovulatory';
  else phase = 'luteal';
  return { day, phase, cycleStart: start, cycleLen, lateBy: !next ? Math.max(0, day - m.avgLen) : 0 };
}

export const nextStart = (m: CycleModel) => (m.starts.length ? addDays(m.starts[m.starts.length - 1], m.avgLen) : null);

/** Прогноз начала следующих циклов (не раньше завтрашнего дня) */
export function predictedStarts(m: CycleModel, today: string, count = 3) {
  if (!m.starts.length) return [];
  const last = m.starts[m.starts.length - 1];
  const out: string[] = [];
  for (let k = 1; out.length < count && k < count + 4; k++) {
    const d = addDays(last, k * m.avgLen);
    if (d > today) out.push(d);
  }
  return out;
}

export interface DayMarks {
  isStart: boolean;
  actual: boolean;
  predicted: boolean;
  ovulation: boolean;
}

/** Отметки дней для календаря */
export function marksFor(m: CycleModel, today: string) {
  const preds = predictedStarts(m, today);
  return (date: string): DayMarks => {
    const isStart = m.starts.includes(date);
    const actual = date <= today && m.starts.some((s) => date >= s && daysBetween(s, date) < m.periodLen);
    const predicted = !actual && preds.some((p) => date >= p && daysBetween(p, date) < m.periodLen);
    const ovulation = date >= today && preds.some((p) => addDays(p, -LUTEAL_DAYS) === date);
    return { isStart, actual, predicted, ovulation };
  };
}

/** Непрерывные отрезки одной фазы для полос на графиках */
export function phaseRuns(m: CycleModel, dates: string[]) {
  const runs: { phase: Phase | null; start: number; count: number }[] = [];
  dates.forEach((d, i) => {
    const p = dayInfo(m, d)?.phase ?? null;
    const last = runs[runs.length - 1];
    if (last && last.phase === p) last.count++;
    else runs.push({ phase: p, start: i, count: 1 });
  });
  return runs;
}

export interface PhaseText {
  title: string;
  about: string;
  tasks: string;
  sport: string;
  food: string;
  sleep: string;
}

export const PHASE_TEXT: Record<Phase, PhaseText> = {
  menstrual: {
    title: 'Менструальная фаза',
    about: 'Начало цикла: эстроген и прогестерон на низком уровне.',
    tasks: 'Ориентируйся на заряд дня: он уже учитывает recovery и самочувствие. Если болит, начни с лёгких задач.',
    sport: 'Лёгкая и умеренная активность в среднем уменьшает менструальную боль [2]. Разница в спортивных результатах между фазами в среднем очень мала [1].',
    food: 'С кровью теряется железо. Норма для женщин 19–50 лет — 18 мг в день, при обильных месячных риск дефицита выше [6].',
    sleep: 'Субъективно сон часто хуже всего именно в дни месячных [4]. Если ночь была плохой, не ставь сложные задачи на вечер.'
  },
  follicular: {
    title: 'Фолликулярная фаза',
    about: 'После месячных растёт эстроген, фаза длится до овуляции.',
    tasks: 'Хорошее время для насыщенных дней, если заряд это позволяет. Решай по заряду, а не по календарю.',
    sport: 'Различия в результатах между фазами в среднем малы. Полезнее замечать собственную реакцию на нагрузку [1].',
    food: 'Особых рекомендаций для этой фазы исследования не дают.',
    sleep: 'Сон в эту фазу обычно ровнее, чем перед месячными [4].'
  },
  ovulatory: {
    title: 'Овуляторная фаза',
    about: 'Около овуляции: пик эстрогена, затем начинает расти прогестерон. Дата по календарю приблизительная.',
    tasks: 'Ориентируйся на заряд дня.',
    sport: 'Различия в результатах между фазами в среднем малы. Полезнее замечать собственную реакцию на нагрузку [1].',
    food: 'Особых рекомендаций для этой фазы исследования не дают.',
    sleep: 'Особых изменений сна в эти дни исследования не описывают.'
  },
  luteal: {
    title: 'Лютеиновая фаза',
    about: 'После овуляции растёт прогестерон. HRV в среднем ниже, чем в фолликулярной фазе [3], и WHOOP учитывает это в recovery.',
    tasks: 'Заряд дня уже учитывает recovery и самочувствие, отдельно фазу из него не вычитаем.',
    sport: 'Различия в результатах между фазами в среднем малы. Полезнее замечать собственную реакцию на нагрузку [1].',
    food: 'Расход энергии в покое может быть немного выше, чем в фолликулярной фазе [5], так что лёгкий рост аппетита — нормально.',
    sleep: 'Температура тела выше, REM-сна немного меньше [4]. Перед месячными сон ухудшается у части женщин, но не у всех [7].'
  }
};

export const SOURCES = [
  { n: 1, text: 'McNulty K. L. и соавт. Effects of menstrual cycle phase on exercise performance. Sports Medicine, 2020', url: 'https://doi.org/10.1007/s40279-020-01319-3' },
  { n: 2, text: 'Armour M. и соавт. Exercise for dysmenorrhoea. Cochrane Database of Systematic Reviews, 2019', url: 'https://doi.org/10.1002/14651858.CD004142.pub4' },
  { n: 3, text: 'Schmalenberger K. M. и соавт. Within-person changes in cardiac vagal activity across the menstrual cycle. Journal of Clinical Medicine, 2019', url: 'https://doi.org/10.3390/jcm8111946' },
  { n: 4, text: 'Baker F. C., Driver H. S. Circadian rhythms, sleep, and the menstrual cycle. Sleep Medicine, 2007', url: 'https://doi.org/10.1016/j.sleep.2006.09.011' },
  { n: 5, text: 'Benton M. J. и соавт. Effect of menstrual cycle on resting metabolism. PLoS ONE, 2020', url: 'https://doi.org/10.1371/journal.pone.0236025' },
  { n: 6, text: 'NIH Office of Dietary Supplements. Iron: Fact Sheet for Health Professionals', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/' },
  { n: 7, text: 'Baker F. C., Lee K. A. Menstrual cycle effects on sleep. Sleep Medicine Clinics, 2022', url: 'https://doi.org/10.1016/j.jsmc.2022.02.004' }
];
