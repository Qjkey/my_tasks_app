/**
 * «Домашка» — подсветка несделанных предметов.
 * Не влияет на огонёк: только UI.
 *
 * Красный:
 * - накануне урока (предмет завтра) — как раньше;
 * - в день урока — только если пункт создан минимум за день до сегодня
 *   (созданный сегодня в день урока не подсвечивается).
 */

import { dayNameFromDate, addDays, toDateKey } from "./model.js";

export const HOMEWORK_LIST_NAME = "домашка";

/** Расписание: предметы на каждый день недели */
export const SCHOOL_SCHEDULE = {
  понедельник: ["алгебра", "английский", "физика", "русский", "литература"],
  вторник: ["химия", "физика", "биология", "русский", "география", "английский", "история"],
  среда: ["алгебра", "труд", "английский", "геометрия", "общество", "литература"],
  четверг: ["алгебра", "география", "русский", "литература", "химия"],
  пятница: ["биология", "алгебра", "геометрия", "физика", "история", "информатика", "вероятность"],
  суббота: [],
  воскресенье: [],
};

export function normalizeSubject(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

export function isHomeworkList(listOrTitle) {
  const title =
    typeof listOrTitle === "string" ? listOrTitle : listOrTitle?.title;
  return normalizeSubject(title) === HOMEWORK_LIST_NAME;
}

export function subjectsOnDate(date = new Date()) {
  const dayName = dayNameFromDate(date);
  return SCHOOL_SCHEDULE[dayName] || [];
}

function titleMatchesSubject(title, sub) {
  if (title === sub) return true;
  if (title.startsWith(sub + " ")) return true;
  if (title.startsWith(sub + "|")) return true;
  if (title.startsWith(sub + ":")) return true;
  if (title.startsWith(sub + "—") || title.startsWith(sub + "-")) return true;
  return false;
}

function matchesAnySubject(taskTitle, subjects) {
  const title = normalizeSubject(taskTitle);
  if (!title || !subjects?.length) return false;
  return subjects.some((sub) => titleMatchesSubject(title, sub));
}

/**
 * Срочная ли подзадача.
 * @param {string|{ title?: string, createdAt?: string|null }} task — title или объект пункта
 */
export function isHomeworkUrgent(task, date = new Date()) {
  const title = typeof task === "string" ? task : task?.title;
  if (!normalizeSubject(title)) return false;

  const todaySubs = subjectsOnDate(date);
  const tomorrowSubs = subjectsOnDate(addDays(date, 1));

  // Накануне урока — всегда (если предмет завтра)
  if (matchesAnySubject(title, tomorrowSubs)) return true;

  // В день урока — только если создана не сегодня
  if (matchesAnySubject(title, todaySubs)) {
    const createdAt = typeof task === "object" && task ? task.createdAt : null;
    const todayKey = toDateKey(date);
    // без даты — считаем старым пунктом (уже был до сегодня)
    if (!createdAt) return true;
    return String(createdAt) < todayKey;
  }

  return false;
}

/** Есть ли в списке срочные несделанные пункты */
export function homeworkListHasUrgent(list, date = new Date()) {
  if (!isHomeworkList(list)) return false;
  return (list.tasks || []).some((t) => !t.status && isHomeworkUrgent(t, date));
}

export function getHomeworkList(store) {
  for (const list of Object.values(store?.lists || {})) {
    if (isHomeworkList(list)) return list;
  }
  return null;
}
