import Dexie, { type Table } from 'dexie';

export type Energy = 1 | 2 | 3;
export type ListId = 'work' | 'personal';

export interface Sub {
  id: string;
  title: string;
  done: boolean;
}

export interface Comment {
  id: string;
  text: string;
  at: number;
}

export interface Task {
  id: string;
  title: string;
  /** день, на который задача запланирована, YYYY-MM-DD */
  date: string;
  /** время напоминания HH:MM или '' */
  time: string;
  /** дедлайн YYYY-MM-DD или '' */
  deadline: string;
  energy: Energy;
  list: ListId;
  done: boolean;
  doneAt: number | null;
  subs: Sub[];
  comments: Comment[];
  createdAt: number;
  updatedAt: number;
}

/** след переноса: задача уехала с одного дня на другой */
export interface Move {
  id: string;
  taskId: string;
  title: string;
  from: string;
  to: string;
  at: number;
}

export interface Day {
  date: string;
  /** самочувствие 1–5 */
  mood?: number;
  /** предложение перенести задачи отклонено на этот день */
  planDismissed?: boolean;
}

/** данные WHOOP за один физиологический день (по дате пробуждения) */
export interface WhoopDay {
  date: string;
  cycleId: number;
  recovery?: number;
  recoveryState?: string;
  hrv?: number;
  rhr?: number;
  spo2?: number;
  skinTemp?: number;
  strain?: number;
  sleepMs?: number;
  inBedMs?: number;
  deepMs?: number;
  remMs?: number;
  lightMs?: number;
  awakeMs?: number;
  sleepPerf?: number;
  updatedAt: number;
}

/** отметка начала месячных */
export interface Period {
  start: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

class FemForaDB extends Dexie {
  tasks!: Table<Task, string>;
  moves!: Table<Move, string>;
  days!: Table<Day, string>;
  settings!: Table<Setting, string>;
  whoop!: Table<WhoopDay, string>;
  periods!: Table<Period, string>;

  constructor() {
    super('femfora');
    this.version(1).stores({
      tasks: 'id, date, done, deadline',
      moves: 'id, from, to, taskId',
      days: 'date',
      settings: 'key'
    });
    this.version(2).stores({
      whoop: 'date, cycleId'
    });
    this.version(3).stores({
      periods: 'start'
    });
  }
}

export const db = new FemForaDB();
export const uid = () => crypto.randomUUID();
