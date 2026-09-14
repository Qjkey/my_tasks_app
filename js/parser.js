/**
 * Парсер «кода» задач планера.
 *
 * Маркеры дня:
 *   [] / [x] / [xx] / [{}]
 * Описание: { Название | текст до 64 }
 *
 * Адаптивные списки (Keep):
 *   [{1}] { Покупки }     — определение (после дней / где угодно)
 *       - { Молоко }
 *   В дне: [{1}]          — закрепить список №1 в этом месте
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

function stableId(prefix, parts) {
  const raw = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}_${(h >>> 0).toString(36)}`;
}

function classifyMarker(marker) {
  const m = marker
    .toLowerCase()
    .replace(/х/g, "x")
    .replace(/\s+/g, "");

  const listDef = m.match(/^\[\{(\d+)\}\]$/);
  if (listDef) return { kind: "list", listId: listDef[1], hasSubs: true };

  if (m === "[]") return { kind: "daily", hasSubs: false };
  if (m === "[x]") return { kind: "once", hasSubs: false };
  if (m === "[xx]") return { kind: "weekly", hasSubs: false };
  if (m === "[{}]") return { kind: "daily", hasSubs: true };
  return null;
}

function splitTitleDesc(inner) {
  const idx = inner.indexOf("|");
  if (idx === -1) return { title: inner.trim(), description: "" };
  return {
    title: inner.slice(0, idx).trim(),
    description: inner.slice(idx + 1).trim().slice(0, DESC_MAX),
  };
}

const DAY_RE = /^\(\s*([^)]+?)\s*\)\s*$/u;
const LIST_REF_RE = /^\[\{(\d+)\}\]\s*$/u;
const LIST_DEF_RE = /^\[\{(\d+)\}\]\s*\{\s*(.*?)\s*\}\s*$/u;
const TASK_RE = /^(\[[^\]]*\])\s*\{\s*(.*?)\s*\}\s*$/u;
const SUB_RE = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/u;

export function parseTaskCode(text) {
  const days = Object.fromEntries(DAYS.map((d) => [d, []]));
  const lists = {};
  let current = null;
  let lastParent = null;
  let lastList = null;
  let taskIndex = 0;

  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "    ");
    if (!line.trim()) continue;

    const dayMatch = line.trim().match(DAY_RE);
    if (dayMatch) {
      current = normalizeDay(dayMatch[1]);
      lastParent = null;
      lastList = null;
      taskIndex = 0;
      continue;
    }

    const subMatch = line.match(SUB_RE);
    if (subMatch && (lastParent || lastList)) {
      const { title, description } = splitTitleDesc(subMatch[1]);
      if (lastList) {
        const subIndex = lastList.subtasks.length;
        lastList.subtasks.push({
          id: stableId("als", [lastList.listId, title, subIndex]),
          title,
          description,
        });
      } else {
        const subIndex = lastParent.subtasks.length;
        lastParent.subtasks.push({
          id: stableId("s", [current || "_", lastParent.id, title, subIndex]),
          title,
          description,
        });
      }
      continue;
    }

    const trimmed = line.trim();

    // [{N}] { Title } — определение адаптивного списка (не задача дня)
    const listDef = trimmed.match(LIST_DEF_RE);
    if (listDef) {
      const listId = listDef[1];
      const { title, description } = splitTitleDesc(listDef[2]);
      const list = {
        listId,
        title: title || `Список ${listId}`,
        description: description || "",
        subtasks: [],
      };
      lists[listId] = list;
      lastList = list;
      lastParent = null;
      continue;
    }

    // [{N}] — закрепление в дне
    const listRef = trimmed.match(LIST_REF_RE);
    if (listRef) {
      const listId = listRef[1];
      lastList = lists[listId] || null;
      lastParent = null;
      if (current) {
        days[current].push({
          id: stableId("ref", [current, listId, taskIndex]),
          kind: "listref",
          listId,
          title: "",
          description: "",
          subtasks: [],
        });
        taskIndex += 1;
      }
      continue;
    }

    const taskMatch = trimmed.match(TASK_RE);
    if (taskMatch) {
      const meta = classifyMarker(taskMatch[1]);
      if (!meta || meta.kind === "list") {
        lastParent = null;
        lastList = null;
        continue;
      }
      if (!current) {
        lastParent = null;
        lastList = null;
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
      lastList = null;
      continue;
    }

    lastParent = null;
    lastList = null;
  }

  return { template: String(text || ""), days, lists };
}

/** Раскрыть listref в задачу adaptive (не влияет на огонёк) */
export function materializeTask(task, store) {
  if (task.kind !== "listref") {
    return {
      ...task,
      description: task.description || "",
      subtasks: (task.subtasks || []).map((s) => ({
        ...s,
        description: s.description || "",
      })),
    };
  }
  const lib = store.lists?.[task.listId];
  if (!lib) {
    return {
      id: `alist_${task.listId}_missing`,
      title: `Список ${task.listId} (не найден)`,
      kind: "adaptive",
      listId: task.listId,
      description: "",
      subtasks: [],
    };
  }
  return {
    id: `alist_${task.listId}`,
    title: lib.title,
    kind: "adaptive",
    listId: task.listId,
    description: lib.description || "",
    subtasks: (lib.subtasks || []).map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description || "",
    })),
  };
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
    .map((t) => materializeTask(t, store))
    .filter(Boolean);

  const extras = (store.extraTasks?.[dateKey] || []).map((t) =>
    materializeTask(t, store)
  );

  const combined = [...list, ...extras];
  if (order?.length) {
    const map = new Map(combined.map((t) => [t.id, t]));
    const ordered = [];
    for (const id of order) {
      // order может хранить ref-id — сопоставим с alist_N
      if (map.has(id)) {
        ordered.push(map.get(id));
        map.delete(id);
        continue;
      }
    }
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
    lists: {},
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
