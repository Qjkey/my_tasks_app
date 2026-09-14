/**
 * Парсер «кода» задач планера.
 *
 * Маркеры:
 *   []      — каждый день
 *   [x]/х]  — один раз в этот день
 *   [xx]/хх]— каждую неделю в этот день
 *   [{}]    — список с подзадачами (в рамках дня из секции)
 *   - {..}  — подзадача
 *
 * Описание (до 64 символов) — через « | » внутри скобок:
 *   [] { Купить молоко | 2.5%, не забыть }
 *   - { Умыться | холодной водой }
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
export const DESC_MAX = 64;

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

/** Стабильный id — не ломает галочки при повторном сохранении кода */
function stableId(prefix, parts) {
  const raw = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}_${(h >>> 0).toString(36)}`;
}

/** Нормализует маркер: daily | once | weekly (+ hasSubs) */
function classifyMarker(marker) {
  const m = marker
    .toLowerCase()
    .replace(/х/g, "x")
    .replace(/\s+/g, "");

  if (m === "[]") return { kind: "daily", hasSubs: false };
  if (m === "[x]") return { kind: "once", hasSubs: false };
  if (m === "[xx]") return { kind: "weekly", hasSubs: false };
  if (m === "[{}]") return { kind: "daily", hasSubs: true };
  // устаревшие [{x}] / [{xx}] — больше не поддерживаются
  return null;
}

function splitTitleDesc(inner) {
  const idx = inner.indexOf("|");
  if (idx === -1) {
    return { title: inner.trim(), description: "" };
  }
  const title = inner.slice(0, idx).trim();
  const description = inner.slice(idx + 1).trim().slice(0, DESC_MAX);
  return { title, description };
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
  let taskIndex = 0;

  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "    ");
    if (!line.trim()) continue;

    const dayMatch = line.trim().match(DAY_RE);
    if (dayMatch) {
      const day = normalizeDay(dayMatch[1]);
      current = day;
      lastParent = null;
      taskIndex = 0;
      continue;
    }

    if (!current) continue;

    const subMatch = line.match(SUB_RE);
    if (subMatch && lastParent) {
      const { title, description } = splitTitleDesc(subMatch[1]);
      const subIndex = lastParent.subtasks.length;
      lastParent.subtasks.push({
        id: stableId("s", [current, lastParent.id, title, subIndex]),
        title,
        description,
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
      const { title, description } = splitTitleDesc(taskMatch[2]);
      const task = {
        id: stableId("t", [current, meta.kind, title, taskIndex]),
        title,
        description: meta.hasSubs ? "" : description,
        kind: meta.kind,
        subtasks: [],
      };
      taskIndex += 1;
      days[current].push(task);
      lastParent = meta.hasSubs ? task : null;
      continue;
    }

    lastParent = null;
  }

  return { template: String(text || ""), days };
}

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
 * Порядок только по dateKey (не по имени дня — иначе путаются недели).
 */
export function buildDayTasks(store, dayName, dateKey) {
  const templateTasks = store.days?.[dayName] || [];
  const order = store.order?.[dateKey] || null;
  const onceDone = store.onceDone || {};

  let list = templateTasks
    .filter((t) => {
      if (t.kind !== "once") return true;
      const doneOn = onceDone[t.id];
      if (!doneOn) return true;
      return doneOn === dateKey;
    })
    .map((t) => ({
      ...t,
      description: t.description || "",
      subtasks: (t.subtasks || []).map((s) => ({
        ...s,
        description: s.description || "",
      })),
    }));

  const extras = (store.extraTasks?.[dateKey] || []).map((t) => ({
    ...t,
    description: t.description || "",
    subtasks: (t.subtasks || []).map((s) => ({
      ...s,
      description: s.description || "",
    })),
  }));

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
    // новые extra, которых ещё нет в order — сверху
    const leftover = [...map.values()];
    const extraIds = new Set(extras.map((e) => e.id));
    const leftoverExtras = leftover.filter((t) => extraIds.has(t.id));
    const leftoverRest = leftover.filter((t) => !extraIds.has(t.id));
    return [...leftoverExtras, ...ordered, ...leftoverRest];
  }

  return [...extras, ...list];
}

export function emptyStore() {
  return {
    template: "",
    days: Object.fromEntries(DAYS.map((d) => [d, []])),
    completions: {},
    onceDone: {},
    extraTasks: {},
    order: {},
    streak: {
      count: 0,
      lastSuccessDate: null,
      history: {},
    },
    meta: {},
    updatedAt: null,
  };
}
