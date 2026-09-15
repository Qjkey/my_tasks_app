/**
 * Огонёк — по status в днях (listref не учитывается).
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
  return resolveDayItems(store, dayName).filter(
    (t) => t.kind !== "listref" && !t.fromList
  );
}

export function isDayFullyDone(store, dayName) {
  const req = requiredItems(store, dayName);
  if (!req.length) return false;
  return req.every((t) => itemIsDone(t));
}

export function dayWasSuccess(store, dateKey) {
  return store.streak?.history?.[dateKey] === true;
}

function dayParticipates(store, dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dayName = dayNameFromDate(new Date(y, m - 1, d));
  return requiredItems(store, dayName).length > 0;
}

export function evaluateStreak(store, today = new Date()) {
  if (!store.streak) {
    store.streak = { count: 0, lastSuccessDate: null, history: {} };
  }
  if (!store.streak.history) store.streak.history = {};

  const todayKey = toDateKey(today);
  const todayName = dayNameFromDate(today);

  if (dayParticipates(store, todayKey) && isDayFullyDone(store, todayName)) {
    store.streak.history[todayKey] = true;
  }

  let count = 0;
  let last = null;
  let cursor = today;

  for (let i = 0; i < 400; i++) {
    const key = toDateKey(cursor);
    if (!dayParticipates(store, key)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    const success =
      store.streak.history[key] === true ||
      (key === todayKey && isDayFullyDone(store, todayName));
    if (!success) break;
    count += 1;
    if (!last) last = key;
    cursor = addDays(cursor, -1);
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
    const dayName = DAYS[i];
    let status = "future";

    if (key > todayKey) {
      status = "future";
    } else if (
      store.streak?.history?.[key] === true ||
      (key === todayKey && isDayFullyDone(store, dayName))
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
