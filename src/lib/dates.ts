const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOW_LONG = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const pad = (n: number) => String(n).padStart(2, '0');

export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
export const dowIdx = (k: string) => (fromKey(k).getDay() + 6) % 7;
export const mondayOf = (k: string) => addDays(k, -dowIdx(k));

export const longDate = (k: string) => {
  const d = fromKey(k);
  return `${DOW_LONG[dowIdx(k)]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
};
export const shortDate = (k: string) => {
  const d = fromKey(k);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};
/** «с 5 окт», но «со 2 окт» */
export const fromDate = (k: string) => `${fromKey(k).getDate() === 2 ? 'со' : 'с'} ${shortDate(k)}`;

export const monthTitle = (y: number, m: number) => `${MONTHS_NOM[m]} ${y}`;
export const dayNum = (k: string) => fromKey(k).getDate();

export function relativeDay(k: string, today: string) {
  if (k === today) return 'Сегодня';
  if (k === addDays(today, 1)) return 'Завтра';
  if (k === addDays(today, -1)) return 'Вчера';
  return null;
}

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
