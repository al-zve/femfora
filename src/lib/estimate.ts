import type { Energy } from '../db';

/**
 * Оценка нагрузки задачи по тексту — прямо на устройстве, без AI и сети.
 * 1) Ищем похожие задачи среди твоих ответов в «Настроить оценку» и твоих задач.
 * 2) Если похожих нет — правила по основам слов.
 */

type Rule = [RegExp, string];

// быстрые действия, если с них начинается задача, — почти всегда лёгкие
const QUICK_VERBS: Rule[] = [
  [/^(позвонить|набрать)/, 'позвонить'],
  [/^(оплатить|заплатить|перевести деньги|перевести \d)/, 'оплатить'],
  [/^(купить|заказать|докупить)/, 'купить'],
  [/^(отправить|переслать|скинуть|прислать)/, 'отправить'],
  [/^(напомнить|уточнить|спросить)/, 'уточнить'],
  [/^(записаться|забронировать|продлить|отменить)/, 'записаться'],
  [/^(забрать|вынести|полить|распечатать|подписать|отсканировать)/, 'быстрое дело'],
  [/^(ответить)/, 'ответить'],
  [/^(глянуть|посмотреть|проверить)/, 'посмотреть']
];

const HEAVY: Rule[] = [
  [/подготов(ить|ка)|подготовк/, 'подготовка'],
  [/презентац/, 'презентация'],
  [/отч[её]т/, 'отчёт'],
  [/стратег/, 'стратегия'],
  [/исследова|ресерч|анализ|проанализ/, 'исследование'],
  [/разработ|спроектир|архитектур|рефактор|миграц/, 'разработка'],
  [/написать (стать|текст|пост|эссе|глав|спек|тз|документ|план)|статью|спецификац/, 'большой текст'],
  [/выступлен|доклад|защит[аиу]|экзамен|собеседован/, 'выступление'],
  [/интервью/, 'интервью'],
  [/релиз|запуск|выпуск/, 'запуск'],
  [/переезд|ремонт|генеральн/, 'большое дело'],
  [/деклараци|налог/, 'налоги'],
  [/квартал|годов/, 'большой период'],
  [/дизайн(?!ер)|макет|прототип/, 'дизайн'],
  [/обучен|курс(?=\s|$)|выучить|изучить/, 'обучение']
];

const MEDIUM: Rule[] = [
  [/созвон|встреч|звонок с|колл|митинг|синк/, 'встреча'],
  [/ревью|разобрать|разбор|навести порядок/, 'разбор'],
  [/уборк|убрать|стирк|постирать|приготовить|готовк/, 'дела по дому'],
  [/тренировк|спортзал|зал(?=\s|$)|бег(?=\s|$)|пробежк|йог|пилатес|бассейн/, 'тренировка'],
  [/врач|клиник|анализы|стоматолог/, 'врач'],
  [/сходить|съездить|поехать|магазин/, 'поездка'],
  [/письм|почт/, 'почта'],
  [/обсудить|согласовать|планирован/, 'обсуждение'],
  [/сборк|testflight|деплой|опубликовать/, 'сборка']
];

const LIGHT: Rule[] = [
  [/позвонить|оплатить|купить|напомнить|отправить|переслать|скинуть|продлить|записаться|забронировать|полить|вынести|забрать|подписать/, 'быстрое действие'],
  [/сообщени|смс|ответить/, 'сообщение']
];

// в JS \b не работает с кириллицей, поэтому границы слова — пробел или край строки
const BIGGER = /(^|\s)(больш|весь|вс[её](?=\s|$)|полностью|целиком|много|несколько)/;
const SMALLER = /(^|\s)(быстро|чуть|мелк|коротк|пару|одн[оу](?=\s))/;

export interface Estimate {
  energy: Energy;
  reason: string;
}

export interface Example {
  title: string;
  energy: Energy;
}

const LABEL: Record<Energy, string> = { 1: 'лёгкая', 2: 'средняя', 3: 'тяжёлая' };

const find = (rules: Rule[], text: string) => rules.find(([re]) => re.test(text))?.[1];

const normalize = (title: string) =>
  title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/@\s?\d{1,2}[:.]\d{2}/, '')
    .replace(/\s+/g, ' ')
    .trim();

/* ---------- похожие задачи ---------- */

const STOP = new Set(['в', 'во', 'на', 'с', 'со', 'для', 'и', 'по', 'к', 'ко', 'о', 'об', 'от', 'до', 'за', 'из', 'у', 'про', 'а', 'не', 'же', 'ли', 'мне', 'мой', 'моя', 'мои']);
const ENDING = /(ами|ями|ого|его|ому|ему|ыми|ими|иях|ах|ях|ов|ев|ей|ой|ий|ый|ая|яя|ое|ее|ую|юю|ом|ем|ам|ям|ть|ти|ся|сь|а|я|о|е|ы|и|у|ю|ь)$/;

/** грубая основа слова: без окончания, первые 6 букв */
export function stem(w: string) {
  let x = w;
  for (let i = 0; i < 2 && x.length > 4; i++) x = x.replace(ENDING, '');
  return x.slice(0, 6);
}

const tokens = (title: string) =>
  normalize(title)
    .split(/[^a-zа-я0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);

/** похожесть 0..1; совпадение первого слова (обычно глагола) весит вдвое больше */
function similarity(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const wa = a.map((_, i) => (i === 0 ? 2 : 1));
  const wb = b.map((_, i) => (i === 0 ? 2 : 1));
  let common = 0;
  a.forEach((t, i) => {
    const j = b.indexOf(t);
    if (j >= 0) common += Math.min(wa[i], wb[j]);
  });
  const na = wa.reduce((x, y) => x + y, 0);
  const nb = wb.reduce((x, y) => x + y, 0);
  return common / Math.sqrt(na * nb);
}

const SIMILAR = 0.4;

function bySimilar(title: string, examples: Example[]) {
  const t = tokens(title);
  const key = normalize(title);
  const scored = examples
    .map((e) => ({ e, s: normalize(e.title) === key ? 1 : similarity(t, tokens(e.title)) }))
    .filter((x) => x.s >= SIMILAR)
    .sort((a, b) => b.s - a.s);
  // одинаковые названия считаем один раз
  const seen = new Set<string>();
  const top = scored.filter((x) => {
    const k = normalize(x.e.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
  if (!top.length) return null;
  const w = top.reduce((sum, x) => sum + x.s, 0);
  const energy = Math.round(top.reduce((sum, x) => sum + x.e.energy * x.s, 0) / w) as Energy;
  return { energy, match: top[0].e.title };
}

/* ---------- правила ---------- */

function byRules(text: string): { energy: Energy; reason: string } {
  const quick = find(QUICK_VERBS, text);
  const heavy = find(HEAVY, text);
  const medium = find(MEDIUM, text);
  const light = find(LIGHT, text);
  const meetingFirst = /^(созвон|встреч|звонок|колл|митинг|синк)/.test(text);
  if (quick && !(heavy && /^(подготов|написать)/.test(text))) return { energy: 1, reason: 'Похоже на короткое дело' };
  if (meetingFirst) return { energy: 2, reason: 'Похоже на встречу — средняя' };
  if (heavy) return { energy: 3, reason: 'Похоже на большое дело' };
  if (medium) return { energy: 2, reason: 'Похоже на дело средней сложности' };
  if (light) return { energy: 1, reason: 'Похоже на короткое дело' };
  return { energy: 2, reason: 'Похожих задач пока нет, поставила среднюю' };
}

export const subtasksBump = (n: number) => (n >= 5 ? 2 : n >= 3 ? 1 : 0);

export function estimateEnergy(title: string, subtasks = 0, examples: Example[] = []): Estimate {
  const text = normalize(title);
  const sim = bySimilar(title, examples);
  let energy: number;
  let reason: string;
  if (sim) {
    energy = sim.energy;
    reason = `Похоже на «${sim.match}» — ${LABEL[sim.energy]}`;
  } else {
    ({ energy, reason } = byRules(text));
  }

  // подзадачи: 3–4 — на ступень тяжелее, 5 и больше — на две
  const bump = Math.min(subtasksBump(subtasks), 3 - energy);
  if (bump > 0) {
    energy += bump;
    reason += `, но ${subtasks} ${subtasks < 5 ? 'подзадачи' : 'подзадач'} — на ${bump === 2 ? 'две ступени' : 'ступень'} тяжелее`;
  } else if (!sim && BIGGER.test(text) && energy < 3) {
    energy++;
    reason += ', и объём, судя по тексту, большой';
  } else if (!sim && SMALLER.test(text) && energy > 1) {
    energy--;
    reason += ', но, судя по тексту, небольшое';
  }

  return { energy: Math.min(3, Math.max(1, energy)) as Energy, reason };
}

/** Задачи для «Настроить оценку» */
export const CALIBRATION = [
  'Ответить на письма',
  'Оплатить квартиру',
  'Созвон с командой',
  'Подготовить презентацию',
  'Написать спецификацию фичи',
  'Ревью дизайна',
  'Собрать сборку в TestFlight',
  'Починить баг в приложении',
  'Сходить в спортзал',
  'Записаться к врачу',
  'Купить продукты',
  'Генеральная уборка',
  'Собрать чемодан',
  'Забронировать отель',
  'Разобрать почту',
  'Подать налоговую декларацию',
  'Написать пост в соцсети',
  'Позвонить маме',
  'Провести интервью с пользовательницей',
  'Спланировать неделю',
  'Обновить резюме',
  'Постирать и развесить бельё',
  'Приготовить ужин',
  'Отправить счёт клиентке',
  'Изучить новую библиотеку',
  'Отрефакторить модуль',
  'Встреча с бухгалтеркой',
  'Прочитать статью',
  'Сделать макет экрана',
  'Выпустить обновление в App Store'
];
