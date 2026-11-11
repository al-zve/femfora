import { db, uid, type Energy, type ListId, type RepeatMode, type RepeatRule, type Series, type Task } from '../db';
import { dropTasks, parseQuickTitle } from './actions';
import { DOW_SHORT, addDays, dayNum, daysBetween, dowIdx, fromKey, plural, toKey, todayKey } from './dates';

/**
 * Повторяющиеся задачи. Серия хранит правило и шаблон, каждый повтор — обычная задача с seriesId:
 * её можно отметить, перенести, она уходит в Google Tasks и напоминания как любая другая.
 *
 * По расписанию: повторы создаются на две недели вперёд, несделанный в свой день тихо пропадает.
 * После выполнения: следующий появляется, когда отметишь текущий; несделанный ждёт.
 */

/** сколько дней вперёд держим повторы по расписанию, включая сегодня */
export const AHEAD = 14;

const lastDom = (k: string) => {
  const d = fromKey(k);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

const step = (r: Extract<RepeatRule, { kind: 'interval' }>) => Math.max(1, r.n) * (r.unit === 'week' ? 7 : 1);

/** приходится ли повтор на день d (для расписания, отсчёт от start) */
export function matches(r: RepeatRule, start: string, d: string) {
  if (d < start) return false;
  switch (r.kind) {
    case 'daily':
      return true;
    case 'weekdays':
      return r.days.includes(dowIdx(d));
    case 'interval':
      return daysBetween(start, d) % step(r) === 0;
    case 'monthly':
      return dayNum(d) === Math.min(r.dom, lastDom(d));
  }
}

/** первый день повтора не раньше `from` */
export function firstOn(r: RepeatRule, start: string, from = start) {
  let d = from < start ? start : from;
  for (let i = 0; i < 400; i++, d = addDays(d, 1)) if (matches(r, start, d)) return d;
  return d;
}

/** следующий день после `from` — для режима «после выполнения» отсчёт идёт от дня, когда сделала */
export function nextAfter(r: RepeatRule, from: string) {
  if (r.kind === 'interval') return addDays(from, step(r));
  if (r.kind === 'daily') return addDays(from, 1);
  return firstOn(r, '0000-01-01', addDays(from, 1));
}

const DOW_DAT = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
/** «по вторникам и четвергам», если дней много — коротко: «по пн, ср, пт» */
const dowList = (days: number[]) => {
  const ds = [...days].sort((a, b) => a - b);
  return ds.length <= 2 ? ds.map((d) => DOW_DAT[d]).join(' и ') : ds.map((d) => DOW_SHORT[d].toLowerCase()).join(', ');
};

/** «Каждые 3 дня», «По пн, чт», «Каждый месяц 15 числа» */
export function describeRule(r: RepeatRule) {
  switch (r.kind) {
    case 'daily':
      return 'Каждый день';
    case 'weekdays':
      if (r.days.length === 7) return 'Каждый день';
      if (r.days.length === 5 && [0, 1, 2, 3, 4].every((d) => r.days.includes(d))) return 'По будням';
      return `По ${dowList(r.days)}`;
    case 'interval':
      if (r.unit === 'day') return r.n === 1 ? 'Каждый день' : `${plural(r.n, 'Каждый', 'Каждые', 'Каждые')} ${r.n} ${plural(r.n, 'день', 'дня', 'дней')}`;
      return r.n === 1 ? 'Каждую неделю' : `${plural(r.n, 'Каждую', 'Каждые', 'Каждые')} ${r.n} ${plural(r.n, 'неделю', 'недели', 'недель')}`;
    case 'monthly':
      return `Каждый месяц ${r.dom} числа`;
  }
}

/** описание вместе с режимом */
export function describe(r: RepeatRule, mode: RepeatMode) {
  if (mode === 'schedule') return describeRule(r);
  if (r.kind === 'daily' || (r.kind === 'interval' && r.unit === 'day' && r.n === 1)) return 'На следующий день после выполнения';
  if (r.kind === 'interval') {
    const unit = r.unit === 'week' ? plural(r.n, 'неделю', 'недели', 'недель') : plural(r.n, 'день', 'дня', 'дней');
    return `Через ${r.n === 1 ? '' : r.n + ' '}${unit} после выполнения`;
  }
  return `${describeRule(r)}, после выполнения`;
}

function instance(s: Series, date: string, now: number): Task {
  return {
    id: uid(),
    title: s.title,
    date,
    time: s.time,
    deadline: '',
    energy: s.energy,
    list: s.list,
    done: false,
    doneAt: null,
    subs: s.subs.map((title) => ({ id: uid(), title, done: false })),
    comments: [],
    createdAt: now,
    updatedAt: now,
    seriesId: s.id,
    occ: date
  };
}

/** одна серия: убрать пропущенные, досоздать новые. Внутри транзакции */
async function syncOne(s: Series, today: string, now: number) {
  if (s.rule.kind === 'weekdays' && !s.rule.days.length) return;
  const items = await db.tasks.where('seriesId').equals(s.id).toArray();
  if (s.mode === 'schedule') {
    // пропущенные повторы тихо пропадают
    await dropTasks(items.filter((t) => !t.done && t.date < today));
    const add: Task[] = [];
    const end = addDays(today, AHEAD - 1);
    let from = addDays(s.genUntil, 1);
    if (from < today) from = today;
    for (let d = firstOn(s.rule, s.start, from); d <= end; d = firstOn(s.rule, s.start, addDays(d, 1))) add.push(instance(s, d, now));
    let genUntil = end > s.genUntil ? end : s.genUntil;
    // редкий повтор (раз в месяц) за пределами двух недель — следующий всё равно видно
    const hasNext = add.length > 0 || items.some((t) => !t.done && t.date >= today);
    if (!hasNext) {
      const d = firstOn(s.rule, s.start, addDays(genUntil, 1));
      add.push(instance(s, d, now));
      genUntil = d;
    }
    if (add.length) await db.tasks.bulkAdd(add);
    if (genUntil !== s.genUntil) await db.series.update(s.id, { genUntil });
    return;
  }
  // после выполнения: держим ровно один несделанный повтор
  if (items.some((t) => !t.done)) return;
  const last = s.lastId ? items.find((t) => t.id === s.lastId) : undefined;
  let date: string;
  if (!last) {
    // текущий повтор удалили — следующий считаем от сегодня
    date = s.lastId ? nextAfter(s.rule, today) : firstOn(s.rule, s.start);
  } else {
    date = nextAfter(s.rule, toKey(new Date(last.doneAt ?? now)));
  }
  const t = instance(s, date, now);
  await db.tasks.add(t);
  await db.series.update(s.id, { lastId: t.id });
}

let chain: Promise<void> = Promise.resolve();

/** Привести все серии в порядок: на открытии приложения, в новый день и после синхронизации с Google */
export function syncSeries(today = todayKey()): Promise<void> {
  chain = chain
    .catch(() => undefined)
    .then(() =>
      db.transaction('rw', [db.tasks, db.moves, db.settings, db.series], async () => {
        const now = Date.now();
        for (const s of await db.series.toArray()) await syncOne(s, today, now);
      })
    );
  return chain;
}

export interface NewSeries {
  title: string;
  date: string;
  energy: Energy;
  list: ListId;
  subs: string[];
  rule: RepeatRule;
  mode: RepeatMode;
}

export async function createSeries(input: NewSeries) {
  const { title, time } = parseQuickTitle(input.title);
  const now = Date.now();
  const s: Series = {
    id: uid(),
    title: title || 'Новая задача',
    time,
    energy: input.energy,
    list: input.list,
    subs: input.subs,
    rule: input.rule,
    mode: input.mode,
    start: input.date,
    genUntil: addDays(input.date, -1),
    createdAt: now,
    updatedAt: now
  };
  await db.series.add(s);
  await syncSeries();
  return s;
}

/** Сделать повторяющейся уже существующую задачу: она становится первым повтором */
export async function repeatTask(task: Task, rule: RepeatRule, mode: RepeatMode) {
  const now = Date.now();
  // просроченная задача становится повтором на сегодня, иначе по расписанию она бы сразу пропала
  const date = !task.done && task.date < todayKey() ? todayKey() : task.date;
  const s: Series = {
    id: uid(),
    title: task.title,
    time: task.time,
    energy: task.energy,
    list: task.list,
    subs: task.subs.map((x) => x.title),
    rule,
    mode,
    start: date,
    genUntil: date,
    lastId: task.id,
    createdAt: now,
    updatedAt: now
  };
  await db.transaction('rw', db.tasks, db.series, async () => {
    await db.series.add(s);
    await db.tasks.update(task.id, { seriesId: s.id, occ: date, date, deadline: '', updatedAt: now });
  });
  await syncSeries();
}

/** Поменять правило или режим. Этот повтор остаётся, следующие пересоздаются от его дня */
export async function changeRepeat(task: Task, rule: RepeatRule, mode: RepeatMode) {
  if (!task.seriesId) return repeatTask(task, rule, mode);
  const sid = task.seriesId;
  const today = todayKey();
  await db.transaction('rw', [db.tasks, db.moves, db.settings, db.series], async () => {
    const others = (await db.tasks.where('seriesId').equals(sid).toArray()).filter((t) => t.id !== task.id && !t.done);
    await dropTasks(others);
    const anchor = task.date < today ? today : task.date;
    if (!task.done && task.date !== anchor) await db.tasks.update(task.id, { date: anchor, occ: anchor, updatedAt: Date.now() });
    await db.series.update(sid, { rule, mode, start: anchor, genUntil: task.done ? addDays(anchor, -1) : anchor, lastId: task.id, updatedAt: Date.now() });
  });
  await syncSeries();
}

/** отвязать повторы от серии — сделанные остаются в истории обычными задачами */
async function unlink(sid: string) {
  await db.tasks
    .where('seriesId')
    .equals(sid)
    .modify((t) => {
      delete t.seriesId;
      delete t.occ;
    });
  await db.series.delete(sid);
}

/** Убрать повтор: эта задача остаётся обычной, следующие повторы удаляются */
export async function stopRepeat(task: Task) {
  const sid = task.seriesId;
  if (!sid) return;
  await db.transaction('rw', [db.tasks, db.moves, db.settings, db.series], async () => {
    await dropTasks((await db.tasks.where('seriesId').equals(sid).toArray()).filter((t) => t.id !== task.id && !t.done));
    await unlink(sid);
  });
}

/** Удалить все повторы: несделанные удаляются, сделанные остаются в истории */
export async function deleteSeries(task: Task) {
  const sid = task.seriesId;
  if (!sid) return;
  await db.transaction('rw', [db.tasks, db.moves, db.settings, db.series], async () => {
    await dropTasks((await db.tasks.where('seriesId').equals(sid).toArray()).filter((t) => !t.done || t.id === task.id));
    await unlink(sid);
  });
}

type Shared = Pick<Task, 'title' | 'time' | 'energy' | 'list'>;

/** Название, время, нагрузка и список меняются у этого и всех следующих несделанных повторов */
export async function updateSeriesFields(task: Task, patch: Partial<Shared>) {
  const sid = task.seriesId;
  const now = Date.now();
  if (!sid) {
    await db.tasks.update(task.id, { ...patch, updatedAt: now });
    return;
  }
  await db.transaction('rw', db.tasks, db.series, async () => {
    await db.series.update(sid, { ...patch, updatedAt: now });
    const items = await db.tasks.where('seriesId').equals(sid).toArray();
    for (const t of items) if (t.id === task.id || (!t.done && t.date >= task.date)) await db.tasks.update(t.id, { ...patch, updatedAt: now });
  });
}

/**
 * После выполнения: отметила — сразу появляется следующий.
 * Сняла отметку — следующий, если его ещё не трогали, убираем, чтобы не было двух.
 */
export async function afterDoneChange(t: Task) {
  const s = t.seriesId ? await db.series.get(t.seriesId) : undefined;
  if (!s || s.mode !== 'after') return;
  if (!t.done && s.lastId && s.lastId !== t.id) {
    await db.transaction('rw', [db.tasks, db.moves, db.settings, db.series], async () => {
      const next = await db.tasks.get(s.lastId!);
      // «не трогали»: не отмечена, без комментариев и сделанных подзадач
      const untouched = !!next && !next.done && !next.comments.length && !next.subs.some((x) => x.done);
      if (next && untouched) await dropTasks([next]);
      if (!next || untouched) await db.series.update(s.id, { lastId: t.id });
    });
    return;
  }
  await syncSeries();
}
