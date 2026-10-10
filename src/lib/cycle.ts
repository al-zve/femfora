import { addDays, daysBetween } from './dates';

export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export const PHASE_NAME: Record<Phase, string> = {
  menstrual: 'менструальная',
  follicular: 'фолликулярная',
  ovulatory: 'овуляторная',
  luteal: 'лютеиновая'
};
/** «в лютеиновой фазе» */
export const PHASE_IN: Record<Phase, string> = {
  menstrual: 'менструальной',
  follicular: 'фолликулярной',
  ovulatory: 'овуляторной',
  luteal: 'лютеиновой'
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
  // последняя отметка слишком давно — прогноз был бы гаданием
  if (daysBetween(last, today) > m.avgLen + 30) return [];
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
    about: 'Первые дни цикла. Эстроген и прогестерон сейчас на самом низком уровне.',
    tasks: 'Смотри на заряд дня: он уже учитывает твой сон и самочувствие. Если болит живот, начни с простых дел, а сложные можно отложить.',
    sport: 'Если есть силы, лёгкое движение — прогулка, йога, спокойное кардио — может уменьшить боль при месячных [2]. Тренироваться как обычно тоже можно: заметной разницы в результатах между фазами исследования не находят [1].',
    food: 'Вместе с кровью уходит железо. Его много в мясе, морепродуктах, фасоли, чечевице и шпинате. Женщинам 19–50 лет нужно около 18 мг железа в день, а при обильных месячных риск нехватки выше [6].',
    sleep: 'В эти дни сон часто кажется хуже обычного [4]. Если ночь выдалась тяжёлой, не ставь сложные задачи на вечер.'
  },
  follicular: {
    title: 'Фолликулярная фаза',
    about: 'Время после месячных и до овуляции. Эстроген постепенно растёт.',
    tasks: 'Если заряд дня высокий, это хорошее время для больших задач. Если нет — ничего страшного: слушай самочувствие, а не календарь.',
    sport: 'Тренируйся как обычно. В среднем результаты в разные фазы почти не отличаются, поэтому лучше ориентироваться на свои ощущения [1].',
    food: 'Особых советов по еде для этой фазы нет, питайся как обычно.',
    sleep: 'Сон в эти дни обычно спокойнее, чем перед месячными [4].'
  },
  ovulatory: {
    title: 'Овуляторная фаза',
    about: 'Примерно середина цикла: эстроген на пике, потом начинает расти прогестерон. Дата по календарю примерная.',
    tasks: 'Особых правил для этих дней нет, ориентируйся на заряд дня.',
    sport: 'Тренируйся как обычно. В среднем результаты в разные фазы почти не отличаются, поэтому лучше ориентироваться на свои ощущения [1].',
    food: 'Особых советов по еде для этой фазы нет, питайся как обычно.',
    sleep: 'Заметных изменений сна в эти дни исследования не описывают.'
  },
  luteal: {
    title: 'Лютеиновая фаза',
    about: 'Вторая половина цикла, после овуляции. Растёт прогестерон, температура тела чуть выше. HRV в среднем ниже, чем до овуляции [3], поэтому recovery в WHOOP тоже может быть ниже обычного.',
    tasks: 'Если recovery ниже привычного, для этой фазы это нормально. Заряд дня это уже учитывает: просто следуй ему и не ругай себя за более спокойный темп.',
    sport: 'Тренируйся по самочувствию. В среднем результаты в эту фазу почти не отличаются от других [1], но если сегодня тяжелее обычного, можно снизить интенсивность.',
    food: 'Может хотеться есть чуть больше, и это нормально: в покое организм может тратить немного больше энергии [5].',
    sleep: 'Температура тела чуть выше, а REM-сна (фазы сновидений) немного меньше [4]. Перед месячными сон ухудшается у некоторых женщин, но не у всех [7].'
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
