/**
 * Парсер «кода» задач планера.
 *
 * Маркеры:
 *   []      — каждый день
 *   [x]/xx] — один раз в этот день (латиница/кириллица)
 *   [xx]/хх]— каждую неделю в этот день
 *   [{}]    — каждый день + подзадачи
 *   [{x}]   — один раз + подзадачи
 *   [{xx}]  — еженедельно + подзадачи
 *   - {..}  — подзадача
 */

export const DAYS = [
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
  "воскресенье",
];

export const DAY_SHORT = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

const DAY_ALIASES = {
  пн: "понедельник",
  вт: "вторник",
  ср: "среда",
  чт: "четверг",
  пт: "пятница",
  сб: "суббота",
  вс: "воскресенье",
  monday: "понедельник",
  tuesday: "вторник",
  wednesday: "среда",
  thursday: "четверг",
  friday: "пятница",
  saturday: "суббота",
  sunday: "воскресенье",
};

function normalizeDay(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  if (DAYS.includes(s)) return s;
  return DAY_ALIASES[s] || null;
}

function uid(prefix = "t") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

/** Нормализует маркер типа: daily | once | weekly */
function classifyMarker(marker) {
  const m = marker
    .toLowerCase()
    .replace(/х/g, "x") // кириллическая х → x
    .replace(/\s+/g, "");

  if (m === "[]") return { kind: "daily", hasSubs: false };
  if (m === "[x]") return { kind: "once", hasSubs: false };
  if (m === "[xx]") return { kind: "weekly", hasSubs: false };
  if (m === "[{}]") return { kind: "daily", hasSubs: true };
  if (m === "[{x}]") return { kind: "once", hasSubs: true };
  if (m === "[{xx}]") return { kind: "weekly", hasSubs: true };
  return null;
}

const DAY_RE = /^\(\s*([^)]+?)\s*\)\s*$/u;
const TASK_RE = /^(\[[^\]]*\])\s*\{\s*(.*?)\s*\}\s*$/u;
const SUB_RE = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/u;

/**
 * @returns {{ template: string, days: Record<string, Task[]> }}
 */
export function parseTaskCode(text) {
  const days = Object.fromEntries(DAYS.map((d) => [d, []]));
  let current = null;
  let lastParent = null;

  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "    ");
    if (!line.trim()) continue;

    const dayMatch = line.trim().match(DAY_RE);
    if (dayMatch) {
      const day = normalizeDay(dayMatch[1]);
      current = day;
      lastParent = null;
      continue;
    }

    if (!current) continue;

    const subMatch = line.match(SUB_RE);
    if (subMatch && lastParent) {
      lastParent.subtasks.push({
        id: uid("s"),
        title: subMatch[1],
      });
      continue;
    }

    const taskMatch = line.trim().match(TASK_RE);
    if (taskMatch) {
      const meta = classifyMarker(taskMatch[1]);
      if (!meta) {
        lastParent = null;
        continue;
      }
      const task = {
        id: uid("t"),
        title: taskMatch[2],
        kind: meta.kind, // daily | once | weekly
        subtasks: [],
      };
      days[current].push(task);
      lastParent = meta.hasSubs ? task : null;
      continue;
    }

    lastParent = null;
  }

  return { template: String(text || ""), days };
}

/** JS getDay(): 0=вс … 6=сб → наш индекс пн=0 */
export function jsDayToIndex(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function dayNameFromDate(date = new Date()) {
  return DAYS[jsDayToIndex(date.getDay())];
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Понедельник недели, содержащей date */
export function startOfWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const idx = jsDayToIndex(d.getDay());
  d.setDate(d.getDate() - idx);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Список задач на конкретную календарную дату.
 * once-задачи скрываются, если уже были «погашены» в completions.onceDone
 */
export function buildDayTasks(store, dayName, dateKey) {
  const templateTasks = store.days?.[dayName] || [];
  const order = store.order?.[dateKey] || store.order?.[dayName] || null;
  const onceDone = store.onceDone || {};

  let list = templateTasks
    .filter((t) => {
      if (t.kind !== "once") return true;
      return !onceDone[t.id];
    })
    .map((t) => ({
      ...t,
      subtasks: (t.subtasks || []).map((s) => ({ ...s })),
    }));

  // Пользовательские задачи, добавленные через «Добавить» на эту дату
  const extras = (store.extraTasks?.[dateKey] || []).map((t) => ({
    ...t,
    subtasks: (t.subtasks || []).map((s) => ({ ...s })),
  }));

  // Если есть сохранённый порядок id — применяем
  const combined = [...list, ...extras];
  if (order?.length) {
    const map = new Map(combined.map((t) => [t.id, t]));
    const ordered = [];
    for (const id of order) {
      if (map.has(id)) {
        ordered.push(map.get(id));
        map.delete(id);
      }
    }
    for (const t of map.values()) ordered.push(t);
    return ordered;
  }

  // extras сверху (как просил пользователь — новые в самый верх)
  return [...extras, ...list];
}

export function emptyStore() {
  return {
    template: "",
    days: Object.fromEntries(DAYS.map((d) => [d, []])),
    completions: {}, // { [dateKey]: { [taskOrSubId]: true } }
    onceDone: {}, // { [taskId]: dateKey }
    extraTasks: {}, // { [dateKey]: Task[] }
    order: {}, // { [dateKey|dayName]: id[] }
    streak: {
      count: 0,
      lastSuccessDate: null,
      history: {}, // { [dateKey]: true|false }
    },
    updatedAt: null,
  };
}
