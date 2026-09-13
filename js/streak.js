/**
 * Логика «Огонька».
 *
 * В зачёт идут daily, weekly и once (если есть на день).
 * Родитель с подзадачами — выполнен, когда выполнены все подзадачи.
 *
 * Огонёк +1 сразу в тот же день, как только все обязательные задачи закрыты.
 * При открытии в новый день: если вчера не закрыт → счётчик = 0.
 *
 * В первый запуск в понедельник новой недели — галочки прошлых дней сбрасываются.
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
 * Первый запуск приложения в понедельник новой недели:
 * все выполнения за прошлые дни сбрасываются (становятся невыполненными).
 * Срабатывает один раз на неделю (ключ mondayResetWeek).
 */
export function applyMondayWeekReset(store, today = new Date()) {
  if (!store.meta) store.meta = {};

  const todayName = dayNameFromDate(today);
  if (todayName !== "понедельник") return false;

  const weekKey = toDateKey(startOfWeek(today));
  if (store.meta.mondayResetWeek === weekKey) return false;

  const todayKey = toDateKey(today);

  for (const key of Object.keys(store.completions || {})) {
    if (key < todayKey) {
      delete store.completions[key];
    }
  }

  for (const [taskId, doneOn] of Object.entries(store.onceDone || {})) {
    if (doneOn < todayKey) {
      delete store.onceDone[taskId];
    }
  }

  // история огонька за прошлые дни — тоже сброс отметок недели
  if (store.streak?.history) {
    for (const key of Object.keys(store.streak.history)) {
      if (key < todayKey) {
        delete store.streak.history[key];
      }
    }
  }

  store.meta.mondayResetWeek = weekKey;
  return true;
}

/**
 * Пересчёт серии. +1 в тот же день при полном закрытии.
 */
export function evaluateStreak(store, today = new Date()) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {} };
  }
  if (!store.streak.history) store.streak.history = {};

  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(addDays(today, -1));

  // --- Вчера: если не закрыт и уже новый день → сброс серии ---
  const yRequired = requiredTasks(store, yesterdayKey);
  if (yRequired.length) {
    const yDone = isDayFullyDone(store, yesterdayKey);
    store.streak.history[yesterdayKey] = yDone;

    if (!yDone) {
      store.streak.count = 0;
      if (
        !store.streak.lastSuccessDate ||
        store.streak.lastSuccessDate <= yesterdayKey
      ) {
        // серия прервана; сегодняшний успех начнёт с 1
        if (store.streak.lastSuccessDate !== todayKey) {
          store.streak.lastSuccessDate = null;
        }
      }
    }
  }

  // --- Сегодня: сразу +1 при полном выполнении ---
  const tDone = isDayFullyDone(store, todayKey);
  const alreadyCounted = store.streak.lastSuccessDate === todayKey;

  if (tDone) {
    store.streak.history[todayKey] = true;
    if (!alreadyCounted) {
      const continued =
        store.streak.lastSuccessDate === yesterdayKey ||
        store.streak.count === 0 ||
        !store.streak.lastSuccessDate;
      store.streak.count = continued ? (store.streak.count || 0) + 1 : 1;
      store.streak.lastSuccessDate = todayKey;
    }
  } else {
    if (store.streak.history[todayKey] === true || alreadyCounted) {
      store.streak.history[todayKey] = false;
      if (store.streak.lastSuccessDate === todayKey) {
        store.streak.count = Math.max(0, (store.streak.count || 1) - 1);
        store.streak.lastSuccessDate =
          store.streak.history[yesterdayKey] === true ? yesterdayKey : null;
      }
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
