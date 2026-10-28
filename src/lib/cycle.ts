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
    about: 'Первые дни цикла: эстроген и прогестерон на самом низком уровне, слизистая матки обновляется. Усталость и спазмы в первые дни — частое явление.',
    tasks: 'Если сил меньше, начни с простых и рутинных дел — они идут легче. Сложное удобнее сдвинуть ближе к концу месячных, когда обычно становится легче. Сколько брать на день, подскажет заряд.',
    sport: 'Лёгкое движение — прогулка, йога, спокойное кардио — может уменьшить боль при месячных [2]. Если чувствуешь себя хорошо, можно тренироваться как обычно: заметной разницы в результатах между фазами исследования не находят [1].',
    food: 'Вместе с кровью уходит железо. Его много в мясе, морепродуктах, фасоли, чечевице и шпинате, а витамин C (цитрусовые, перец, ягоды) помогает железу из растительной еды усваиваться лучше [6]. Женщинам 19–50 лет нужно около 18 мг железа в день [6].',
    sleep: 'Сон в эти дни часто кажется хуже обычного [4], поэтому recovery может проседать — это ожидаемо. После плохой ночи лучше не ставить сложное на вечер.'
  },
  follicular: {
    title: 'Фолликулярная фаза',
    about: 'Время после месячных и до овуляции. Эстроген постепенно растёт, температура тела на своём нижнем уровне [4], предменструальных симптомов нет.',
    tasks: 'Если заряд высокий, это удачное окно для больших задач, новых проектов и всего, что требует сосредоточенности. Если нет — самочувствие важнее календаря.',
    sport: 'Удачное время для силовых: по небольшим исследованиям, тренировки с упором на эту фазу дают чуть больший прирост силы и мышц, хотя данные пока предварительные [8]. Перед прыжками и резкими сменами направления не пропускай разминку: часть исследований связывает первую половину цикла с более высоким риском травм связок колена [10].',
    food: 'Аппетит обычно ниже, чем перед месячными: в этой фазе женщины в среднем съедают меньше, чем в лютеиновой [11]. Если хочется что-то поменять в питании, сейчас это даётся проще.',
    sleep: 'Сон обычно ровнее, чем перед месячными [4], а HRV в среднем выше, чем во второй половине цикла [3].'
  },
  ovulatory: {
    title: 'Овуляторная фаза',
    about: 'Примерно середина цикла: эстроген на пике, происходит овуляция, затем начинает расти прогестерон. Это самые фертильные дни: зачатие возможно в течение шести дней — за пять дней до овуляции и в сам день овуляции [9]. Дата по календарю примерная, точнее её показывают тесты на овуляцию.',
    tasks: 'Предменструальных симптомов ещё нет, так что при высоком заряде эти дни тоже подходят для важных встреч и сложных задач.',
    sport: 'Тренируйся как обычно: в среднем результаты в разные фазы почти не отличаются [1]. Разминку перед прыжками и резкими поворотами лучше не пропускать — дни перед овуляцией в части исследований связаны с более высоким риском травм связок колена [10].',
    food: 'Около овуляции женщины в среднем едят меньше, а сексуальное желание растёт [12]. Если аппетит ниже обычного, это нормально.',
    sleep: 'Сон в эти дни обычно не меняется. После овуляции температура тела поднимается, и устройства с датчиком температуры кожи это замечают: в исследовании с кольцом разница составила около 0,3 °C [13].'
  },
  luteal: {
    title: 'Лютеиновая фаза',
    about: 'Вторая половина цикла, после овуляции. Растёт прогестерон, температура тела чуть выше [4]. HRV в среднем ниже, чем до овуляции [3], поэтому recovery в WHOOP тоже может быть ниже обычного. В последние дни перед месячными у части женщин появляются ПМС-симптомы.',
    tasks: 'Если recovery ниже привычного, для этой фазы это нормально. Заряд дня это уже учитывает: следуй ему и не ругай себя за более спокойный темп. Ближе к месячным удобно оставлять в плане запас.',
    sport: 'Тренируйся по самочувствию. В среднем результаты в эту фазу почти не отличаются от других [1], но если сегодня тяжелее обычного, можно снизить интенсивность.',
    food: 'Аппетит обычно выше: в среднем женщины съедают в эту фазу примерно на 170 ккал в день больше, чем в фолликулярной [11], а расход энергии в покое может быть немного выше [5]. Желание перекусывать чаще — нормально.',
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
  { n: 7, text: 'Baker F. C., Lee K. A. Menstrual cycle effects on sleep. Sleep Medicine Clinics, 2022', url: 'https://doi.org/10.1016/j.jsmc.2022.02.004' },
  { n: 8, text: 'Kissow J. и соавт. Effects of follicular and luteal phase-based menstrual cycle resistance training on muscle strength and mass. Sports Medicine, 2022', url: 'https://doi.org/10.1007/s40279-022-01679-y' },
  { n: 9, text: 'Wilcox A. J., Weinberg C. R., Baird D. D. Timing of sexual intercourse in relation to ovulation. New England Journal of Medicine, 1995', url: 'https://doi.org/10.1056/NEJM199512073332301' },
  { n: 10, text: 'Hewett T. E., Zazulak B. T., Myer G. D. Effects of the menstrual cycle on anterior cruciate ligament injury risk: a systematic review. American Journal of Sports Medicine, 2007', url: 'https://doi.org/10.1177/0363546506295699' },
  { n: 11, text: 'Tucker J. A. L. и соавт. The effect of the menstrual cycle on energy intake: a systematic review and meta-analysis. Nutrition Reviews, 2025', url: 'https://doi.org/10.1093/nutrit/nuae093' },
  { n: 12, text: 'Schleifenbaum L. и соавт. Ovulatory cycle shifts in human motivational prioritisation of sex and food. Hormones and Behavior, 2024', url: 'https://doi.org/10.1016/j.yhbeh.2024.105542' },
  { n: 13, text: 'Maijala A. и соавт. Nocturnal finger skin temperature in menstrual cycle tracking: ambulatory pilot study using a wearable Oura ring. BMC Women\'s Health, 2019', url: 'https://doi.org/10.1186/s12905-019-0844-9' }
];
