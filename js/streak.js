/**
 * Логика «Огонька».
 *
 * В зачёт идут daily, weekly и once (если есть на день).
 * Родитель с подзадачами — выполнен, когда выполнены все подзадачи.
 *
 * При открытии в новый день: если вчерашние обязательные задачи
 * не закрыты → счётчик сбрасывается в 0.
 * Если день закрыт полностью → +1 (один раз за дату).
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
 * Пересчёт серии. Идемпотентен для одной и той же даты.
 */
export function evaluateStreak(store, today = new Date()) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {} };
  }
  if (!store.streak.history) store.streak.history = {};

  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(addDays(today, -1));

  // --- Вчера: фиксация и возможный сброс ---
  const yRequired = requiredTasks(store, yesterdayKey);
  if (yRequired.length) {
    const yDone = isDayFullyDone(store, yesterdayKey);
    store.streak.history[yesterdayKey] = yDone;

    if (!yDone) {
      // Новый день начался, вчера не закрыт → полный сброс
      store.streak.count = 0;
      if (store.streak.lastSuccessDate === yesterdayKey) {
        store.streak.lastSuccessDate = null;
      }
      // Если последний успех был ещё раньше — серия уже мертва
      if (
        store.streak.lastSuccessDate &&
        store.streak.lastSuccessDate < yesterdayKey
      ) {
        store.streak.lastSuccessDate = null;
      }
    }
  }

  // --- Сегодня ---
  const tDone = isDayFullyDone(store, todayKey);
  const wasTodaySuccess = store.streak.history[todayKey] === true;

  if (tDone) {
    store.streak.history[todayKey] = true;
    if (!wasTodaySuccess && store.streak.lastSuccessDate !== todayKey) {
      const continued =
        store.streak.lastSuccessDate === yesterdayKey ||
        store.streak.count === 0 ||
        !store.streak.lastSuccessDate;
      store.streak.count = continued
        ? (store.streak.count || 0) + 1
        : 1;
      store.streak.lastSuccessDate = todayKey;
    }
  } else if (wasTodaySuccess) {
    // Сняли галочки после зачёта дня
    store.streak.history[todayKey] = false;
    if (store.streak.lastSuccessDate === todayKey) {
      store.streak.count = Math.max(0, (store.streak.count || 1) - 1);
      store.streak.lastSuccessDate =
        store.streak.history[yesterdayKey] === true ? yesterdayKey : null;
    }
  }

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
    } else if (
      store.streak?.history?.[key] === true ||
      isDayFullyDone(store, key)
    ) {
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
