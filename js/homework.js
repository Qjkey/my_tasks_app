/**
 * «Домашка» — подсветка несделанных предметов накануне урока.
 * Не влияет на огонёк: только UI.
 */

import { dayNameFromDate, addDays } from "./model.js";

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

/** Предметы на завтра (подсветка «вчера до урока») */
export function tomorrowSubjects(date = new Date()) {
  const tomorrow = addDays(date, 1);
  const dayName = dayNameFromDate(tomorrow);
  return SCHOOL_SCHEDULE[dayName] || [];
}

/** Несделанная подзадача совпадает с предметом завтра */
export function isHomeworkUrgent(taskTitle, date = new Date()) {
  const title = normalizeSubject(taskTitle);
  if (!title) return false;
  const subjects = tomorrowSubjects(date);
  return subjects.some((sub) => {
    if (title === sub) return true;
    // «Алгебра №5», «алгебра | параграф 2»
    if (title.startsWith(sub + " ")) return true;
    if (title.startsWith(sub + "|")) return true;
    if (title.startsWith(sub + ":")) return true;
    if (title.startsWith(sub + "—") || title.startsWith(sub + "-")) return true;
    return false;
  });
}

/** Есть ли в списке срочные несделанные пункты */
export function homeworkListHasUrgent(list, date = new Date()) {
  if (!isHomeworkList(list)) return false;
  return (list.tasks || []).some((t) => !t.status && isHomeworkUrgent(t.title, date));
}

export function getHomeworkList(store) {
  for (const list of Object.values(store?.lists || {})) {
    if (isHomeworkList(list)) return list;
  }
  return null;
}
