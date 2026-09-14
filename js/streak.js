/**
 * Логика «Огонька».
 *
 * История успешных дней (history[date]=true) больше не затирается —
 * понедельничный сброс галочек не должен обнулять серию.
 * +1 за сегодня сразу при полном закрытии дня.
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
    if (doneMap[task.id]) return true;
    return task.subtasks.every((s) => !!doneMap[s.id]);
  }
  return !!doneMap[task.id];
}

export function requiredTasks(store, dateKey) {
  const dayName = dayNameFromDate(parseDateKey(dateKey));
  const tasks = buildDayTasks(store, dayName, dateKey);
  return tasks.filter(
    (t) =>
      (t.kind === "daily" || t.kind === "weekly" || t.kind === "once") &&
      t.kind !== "adaptive"
  );
}

export function isDayFullyDone(store, dateKey) {
  const req = requiredTasks(store, dateKey);
  if (!req.length) return false;
  const doneMap = store.completions?.[dateKey] || {};
  return req.every((t) => isTaskComplete(t, doneMap));
}

/** День успешно закрыт: либо живые галочки, либо зафиксированная история */
export function dayWasSuccess(store, dateKey) {
  if (store.streak?.history?.[dateKey] === true) return true;
  return isDayFullyDone(store, dateKey);
}

function dayParticipates(store, dateKey) {
  return requiredTasks(store, dateKey).length > 0;
}

/**
 * Полный пересчёт серии. Прошлые успехи в history не откатываются.
 */
export function evaluateStreak(store, today = new Date()) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {} };
  }
  if (!store.streak.history) store.streak.history = {};

  const todayKey = toDateKey(today);

  for (let i = 0; i < 21; i++) {
    const key = toDateKey(addDays(today, -i));
    if (!dayParticipates(store, key) && store.streak.history[key] !== true) {
      continue;
    }

    // зафиксированный успех прошлого дня — не трогаем
    if (key < todayKey && store.streak.history[key] === true) continue;

    if (isDayFullyDone(store, key)) {
      store.streak.history[key] = true;
    }
    // никогда не сбрасываем history в false — выполненные дни не отменяются
  }

  // если сегодня нет задач — не считаем «успехом сегодня», идём от вчера
  const startFromToday =
    dayParticipates(store, todayKey) && isDayFullyDone(store, todayKey);

  let count = 0;
  let last = null;
  let cursor = startFromToday ? today : addDays(today, -1);

  for (let i = 0; i < 400; i++) {
    const key = toDateKey(cursor);

    if (!dayParticipates(store, key) && store.streak.history[key] !== true) {
      cursor = addDays(cursor, -1);
      continue;
    }

    if (!dayWasSuccess(store, key)) break;

    count += 1;
    if (!last) last = key;
    cursor = addDays(cursor, -1);
  }

  // если сегодня закрыт — last обязан быть сегодня
  if (startFromToday) {
    store.streak.history[todayKey] = true;
    last = todayKey;
  }

  store.streak.count = count;
  store.streak.lastSuccessDate = last;
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
    } else if (dayWasSuccess(store, key)) {
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
