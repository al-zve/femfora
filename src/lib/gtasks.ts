import { db, type ListId, type Task } from '../db';
import { estimateEnergy } from './estimate';
import { uid } from '../db';
import { todayKey } from './dates';
import { HttpError, TASKS, gfetch } from './google';

/**
 * Двусторонняя синхронизация задач с Google Tasks.
 * Списки «FemFora · Работа» и «FemFora · Личное». Название, день, «сделано» и удаление
 * идут в обе стороны; если задачу поменяли и тут, и там — побеждает более позднее изменение.
 * Подзадачи и время уходят в Google заметкой; обратно из Google берём название, дату и статус.
 */

export const LIST_TITLES: Record<ListId, string> = { work: 'FemFora · Работа', personal: 'FemFora · Личное' };

type GTask = { id: string; title?: string; notes?: string; due?: string; status?: string; completed?: string; parent?: string; deleted?: boolean; hidden?: boolean; updated: string };
type Lists = Record<ListId, string>;

async function ensureLists(): Promise<Lists> {
  const saved = (await db.settings.get('gtask_lists'))?.value as Lists | undefined;
  const all = (await gfetch<{ items?: { id: string; title: string }[] }>(`${TASKS}/users/@me/lists?maxResults=100`)).items ?? [];
  const out = {} as Lists;
  for (const l of ['work', 'personal'] as ListId[]) {
    const found = all.find((x) => x.id === saved?.[l]) ?? all.find((x) => x.title === LIST_TITLES[l]);
    out[l] = found ? found.id : (await gfetch<{ id: string }>(`${TASKS}/users/@me/lists`, { method: 'POST', body: JSON.stringify({ title: LIST_TITLES[l] }) })).id;
  }
  if (saved?.work !== out.work || saved?.personal !== out.personal) await db.settings.put({ key: 'gtask_lists', value: out });
  return out;
}

const listUrl = (list: string) => `${TASKS}/lists/${encodeURIComponent(list)}/tasks`;

function body(t: Task) {
  const lines: string[] = [];
  if (t.time) lines.push(`Время: ${t.time}`);
  for (const s of t.subs) lines.push(`${s.done ? '☑' : '☐'} ${s.title}`);
  return {
    title: t.title,
    notes: lines.join('\n') || undefined,
    due: `${t.date}T00:00:00.000Z`,
    status: t.done ? 'completed' : 'needsAction'
  };
}

/** задача изменилась в FemFora после последней синхронизации */
const dirty = (t: Task) => !t.gTask || t.updatedAt > t.gTask.syncedAt;

async function push(t: Task, lists: Lists): Promise<void> {
  const target = lists[t.list] ?? lists.personal;
  const now = Date.now();
  const save = (g: GTask) => db.tasks.update(t.id, { gTask: { id: g.id, list: target, updated: g.updated, syncedAt: now }, updatedAt: now });
  if (t.gTask && t.gTask.list === target) {
    try {
      const g = await gfetch<GTask>(`${listUrl(target)}/${t.gTask.id}`, { method: 'PATCH', body: JSON.stringify({ ...body(t), completed: t.done ? undefined : null }) });
      await save(g);
      return;
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e; // в Google её удалили — создадим заново
    }
  } else if (t.gTask) {
    // список поменялся (Работа ↔ Личное): удаляем из старого, создаём в новом
    await gfetch(`${listUrl(t.gTask.list)}/${t.gTask.id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  const g = await gfetch<GTask>(listUrl(target), { method: 'POST', body: JSON.stringify(body(t)) });
  await save(g);
}

/** Отправить изменения из FemFora в Google */
export async function pushTasks() {
  const lists = await ensureLists();
  const tomb = ((await db.settings.get('gtask_tombstones'))?.value as { id: string; list: string }[] | undefined) ?? [];
  for (const x of tomb) await gfetch(`${listUrl(x.list)}/${x.id}`, { method: 'DELETE' }).catch(() => undefined);
  if (tomb.length) await db.settings.put({ key: 'gtask_tombstones', value: [] });
  // сделанные задачи, которых в Google никогда не было, не выгружаем — только текущие
  const tasks = (await db.tasks.toArray()).filter((t) => dirty(t) && (t.gTask || !t.done));
  for (const t of tasks) await push(t, lists);
}

/** Забрать изменения из Google в FemFora. Возвращает, сколько новых задач пришло */
export async function pullTasks(): Promise<number> {
  const lists = await ensureLists();
  const meta = (await db.settings.get('gtask_pull'))?.value as { at: string } | undefined;
  const startedAt = new Date().toISOString();
  const local = await db.tasks.toArray();
  const byG = new Map(local.filter((t) => t.gTask).map((t) => [t.gTask!.id, t]));
  const today = todayKey();
  let added = 0;

  for (const l of ['work', 'personal'] as ListId[]) {
    const items: GTask[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ showCompleted: 'true', showHidden: 'true', showDeleted: 'true', maxResults: '100' });
      // с запасом в минуту, чтобы не потерять изменения на стыке
      if (meta?.at) q.set('updatedMin', new Date(Date.parse(meta.at) - 60_000).toISOString());
      if (pageToken) q.set('pageToken', pageToken);
      const j = await gfetch<{ items?: GTask[]; nextPageToken?: string }>(`${listUrl(lists[l])}?${q}`);
      items.push(...(j.items ?? []));
      pageToken = j.nextPageToken;
      if (!pageToken) break;
    }

    for (const g of items) {
      const t = byG.get(g.id);
      if (g.parent) continue; // подзадачи из Google не забираем: они живут в заметке
      if (!t) {
        if (g.deleted || g.status === 'completed' || !g.title?.trim()) continue;
        // новая задача, созданная прямо в Google в списке FemFora
        const now = Date.now();
        const due = g.due?.slice(0, 10);
        await db.tasks.add({
          id: uid(),
          title: g.title.trim(),
          date: due || today,
          time: '',
          deadline: '',
          energy: estimateEnergy(g.title, 0, []).energy,
          list: l,
          done: false,
          doneAt: null,
          subs: [],
          comments: [],
          createdAt: now,
          updatedAt: now,
          gTask: { id: g.id, list: lists[l], updated: g.updated, syncedAt: now }
        });
        added++;
        continue;
      }
      if (g.updated === t.gTask!.updated) continue; // это наше же изменение
      const localNewer = dirty(t) && t.updatedAt > Date.parse(g.updated);
      if (localNewer) continue; // наше изменение позже — оно уйдёт в Google при отправке
      const now = Date.now();
      if (g.deleted) {
        await db.transaction('rw', db.tasks, db.moves, async () => {
          await db.tasks.delete(t.id);
          await db.moves.where('taskId').equals(t.id).delete();
        });
        continue;
      }
      const patch: Partial<Task> = { gTask: { ...t.gTask!, updated: g.updated, syncedAt: now }, updatedAt: now };
      if (g.title?.trim() && g.title.trim() !== t.title) patch.title = g.title.trim();
      const due = g.due?.slice(0, 10);
      if (due && due !== t.date) {
        patch.date = due;
        await db.moves.add({ id: uid(), taskId: t.id, title: t.title, from: t.date, to: due, at: now });
      }
      const done = g.status === 'completed';
      if (done !== t.done) {
        patch.done = done;
        patch.doneAt = done ? (g.completed ? Date.parse(g.completed) : now) : null;
      }
      await db.tasks.update(t.id, patch);
    }
  }
  await db.settings.put({ key: 'gtask_pull', value: { at: startedAt } });
  return added;
}
