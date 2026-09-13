/**
 * Логика «Огонька».
 *
 * Серия пересчитывается целиком по факту выполненных дней —
 * +1 за сегодня сразу, как только все обязательные задачи закрыты.
 */

import {
  buildDayTasks,
  dayNameFromDate,
  parseDateKey,
  toDateKey,
  addDays,
  startOfWeek,
} from "./parser.js";

function isTaskComplete(task, doneMap) {
  if (task.subtasks?.length) {
    // список закрыт, если отмечен заголовок ИЛИ все подзадачи
    if (doneMap[task.id]) return true;
    return task.subtasks.every((s) => !!doneMap[s.id]);
  }
  return !!doneMap[task.id];
}

export function requiredTasks(store, dateKey) {
  const dayName = dayNameFromDate(parseDateKey(dateKey));
  const tasks = buildDayTasks(store, dayName, dateKey);
  return tasks.filter(
    (t) => t.kind === "daily" || t.kind === "weekly" || t.kind === "once"
  );
}

export function isDayFullyDone(store, dateKey) {
  const req = requiredTasks(store, dateKey);
  if (!req.length) return false;
  const doneMap = store.completions?.[dateKey] || {};
  return req.every((t) => isTaskComplete(t, doneMap));
}

/**
 * Первый запуск в понедельник новой недели — сброс галочек прошлых дней.
 */
export function applyMondayWeekReset(store, today = new Date()) {
  if (!store.meta) store.meta = {};

  const todayName = dayNameFromDate(today);
  if (todayName !== "понедельник") return false;

  const weekKey = toDateKey(startOfWeek(today));
  if (store.meta.mondayResetWeek === weekKey) return false;

  const todayKey = toDateKey(today);

  for (const key of Object.keys(store.completions || {})) {
    if (key < todayKey) delete store.completions[key];
  }

  for (const [taskId, doneOn] of Object.entries(store.onceDone || {})) {
    if (doneOn < todayKey) delete store.onceDone[taskId];
  }

  if (store.streak?.history) {
    for (const key of Object.keys(store.streak.history)) {
      if (key < todayKey) delete store.streak.history[key];
    }
  }

  store.meta.mondayResetWeek = weekKey;
  return true;
}

/** День «участвует» в серии (есть обязательные задачи) */
function dayParticipates(store, dateKey) {
  return requiredTasks(store, dateKey).length > 0;
}

/**
 * Полный пересчёт серии от сегодня назад по consecutive успешным дням.
 */
export function evaluateStreak(store, today = new Date()) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {} };
  }
  if (!store.streak.history) store.streak.history = {};

  const todayKey = toDateKey(today);

  // обновить историю на сегодня / вчера (и соседние для календаря)
  for (let i = 0; i < 14; i++) {
    const key = toDateKey(addDays(today, -i));
    if (!dayParticipates(store, key)) continue;
    store.streak.history[key] = isDayFullyDone(store, key);
  }

  const todayDone = dayParticipates(store, todayKey) && isDayFullyDone(store, todayKey);

  if (!todayDone) {
    // серия заканчивается вчера (если вчера закрыт)
    let count = 0;
    let last = null;
    let cursor = addDays(today, -1);
    for (let i = 0; i < 400; i++) {
      const key = toDateKey(cursor);
      if (!dayParticipates(store, key)) {
        cursor = addDays(cursor, -1);
        continue;
      }
      if (!isDayFullyDone(store, key)) break;
      count += 1;
      if (!last) last = key;
      cursor = addDays(cursor, -1);
    }
    store.streak.count = count;
    store.streak.lastSuccessDate = last;
    return store.streak;
  }

  // сегодня закрыт → считаем цепочку включая сегодня
  let count = 0;
  let cursor = today;
  for (let i = 0; i < 400; i++) {
    const key = toDateKey(cursor);
    if (!dayParticipates(store, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isDayFullyDone(store, key)) break;
    count += 1;
    cursor = addDays(cursor, -1);
  }

  store.streak.count = count;
  store.streak.lastSuccessDate = todayKey;
  store.streak.history[todayKey] = true;
  return store.streak;
}

export function weekStatus(store, today = new Date()) {
  const start = startOfWeek(today);
  const todayKey = toDateKey(today);
  const result = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const key = toDateKey(d);
    let status = "future";

    if (key > todayKey) {
      status = "future";
    } else if (isDayFullyDone(store, key) || store.streak?.history?.[key] === true) {
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
