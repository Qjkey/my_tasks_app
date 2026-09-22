/**
 * Огонёк — история по календарным датам.
 *
 * Правила:
 * - Успех дня пишется в streak.history[YYYY-MM-DD] когда все обязательные задачи дня выполнены.
 * - Адаптивный список (listref) учитывается: нужна только галочка самой задачи, не пунктов.
 * - Пока сегодняшний день не закрыт, серия считается от вчера (не сбрасывается утром).
 * - Если вчерашний участвующий день не в history — серия = 0.
 * - Статусы задач дней (включая галочку listref) сбрасываются при наступлении новой недели (пн).
 * - Пункты адаптивных списков (lists.*.tasks) при смене недели не сбрасываются.
 */

import {
  DAYS,
  dayNameFromDate,
  toDateKey,
  addDays,
  startOfWeek,
  resolveDayItems,
  itemIsDone,
} from "./model.js";

export function requiredItems(store, dayName) {
  return resolveDayItems(store, dayName);
}

export function isDayFullyDone(store, dayName) {
  const req = requiredItems(store, dayName);
  if (!req.length) return false;
  return req.every((t) => itemIsDone(t));
}

function dayParticipates(store, dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayName = dayNameFromDate(new Date(y, m - 1, d));
  return requiredItems(store, dayName).length > 0;
}

function ensureStreak(store) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {}, statusWeek: null };
  }
  if (!store.streak.history) store.streak.history = {};
}

/**
 * Новая календарная неделя → обнулить status у задач дней
 * (включая галочку listref на день; пункты lists не трогаем).
 */
export function ensureWeekTaskStatuses(store, today = new Date()) {
  ensureStreak(store);
  const weekKey = toDateKey(startOfWeek(today));
  if (!store.streak.statusWeek) {
    store.streak.statusWeek = weekKey;
    return false;
  }
  if (store.streak.statusWeek === weekKey) return false;

  for (const day of DAYS) {
    for (const item of store[day] || []) {
      item.status = 0;
      if (item.kind === "listref") continue;
      for (const t of item.tasks || []) t.status = 0;
    }
  }
  store.streak.statusWeek = weekKey;
  return true;
}

/** Синхронизировать history за сегодня с живыми статусами */
function syncTodayHistory(store, today = new Date()) {
  const todayKey = toDateKey(today);
  const todayName = dayNameFromDate(today);

  if (!dayParticipates(store, todayKey)) {
    delete store.streak.history[todayKey];
    return;
  }

  if (isDayFullyDone(store, todayName)) {
    store.streak.history[todayKey] = true;
  } else {
    delete store.streak.history[todayKey];
  }
}

export function evaluateStreak(store, today = new Date()) {
  ensureStreak(store);
  ensureWeekTaskStatuses(store, today);
  syncTodayHistory(store, today);

  const todayKey = toDateKey(today);
  const yesterday = addDays(today, -1);

  // Если сегодня ещё не закрыт — серия держится на вчерашнем успехе
  let cursor =
    store.streak.history[todayKey] === true ? today : yesterday;

  let count = 0;
  let last = null;

  for (let i = 0; i < 400; i++) {
    const key = toDateKey(cursor);
    if (!dayParticipates(store, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (store.streak.history[key] !== true) break;
    count += 1;
    if (!last) last = key;
    cursor = addDays(cursor, -1);
  }

  store.streak.count = count;
  store.streak.lastSuccessDate = last;
  return store.streak;
}

export function weekStatus(store, today = new Date()) {
  ensureStreak(store);
  ensureWeekTaskStatuses(store, today);
  syncTodayHistory(store, today);

  const start = startOfWeek(today);
  const todayKey = toDateKey(today);
  const result = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const key = toDateKey(d);
    let status = "future";

    if (key > todayKey) {
      status = "future";
    } else if (store.streak.history[key] === true) {
      status = "done";
    } else if (key < todayKey) {
      status = "missed";
    } else {
      status = "today";
    }

    result.push({ date: d, key, status, index: i });
  }
  return result;
}

export function pluralDays(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} дней`;
  if (last === 1) return `${n} день`;
  if (last >= 2 && last <= 4) return `${n} дня`;
  return `${n} дней`;
}
