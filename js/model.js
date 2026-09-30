/**
 * Модель данных v2
 *
 * KV:
 * {
 *   version: 2,
 *   понедельник: { slots: Slot[], items: Item[] },
 *   ...
 *   lists: { "1": List },
 *   streak: { ... }
 * }
 *
 * Slot: { id, start, end }  // end = start следующего или LAST_SLOT_END
 * Item: { title, subtitle, status, kind?, listId?, slotId?, tasks?: Sub[] }
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
export const DESC_MAX = 256;
export const LAST_SLOT_END = "22:00";

const DAY_ALIASES = {
  пн: "понедельник",
  вт: "вторник",
  ср: "среда",
  чт: "четверг",
  пт: "пятница",
  сб: "суббота",
  вс: "воскресенье",
};

export function normalizeDay(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  if (DAYS.includes(s)) return s;
  return DAY_ALIASES[s] || null;
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

export function emptyDay() {
  return { slots: [], items: [] };
}

export function emptyStore() {
  const store = {
    version: 2,
    lists: {},
    streak: { count: 0, lastSuccessDate: null, history: {}, statusWeek: null },
    updatedAt: null,
  };
  for (const d of DAYS) store[d] = emptyDay();
  return store;
}

/** Нормализация дня: массив (legacy) → { slots, items } */
export function ensureDay(store, dayName) {
  const raw = store[dayName];
  if (!raw) {
    store[dayName] = emptyDay();
    return store[dayName];
  }
  if (Array.isArray(raw)) {
    store[dayName] = { slots: [], items: raw };
    return store[dayName];
  }
  if (!Array.isArray(raw.slots)) raw.slots = [];
  if (!Array.isArray(raw.items)) raw.items = [];
  return raw;
}

export function getDayItems(store, dayName) {
  return ensureDay(store, dayName).items;
}

export function getDaySlots(store, dayName) {
  return ensureDay(store, dayName).slots;
}

export function timeToMinutes(hhmm) {
  const m = String(hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatTime(hhmm) {
  const mins = timeToMinutes(hhmm);
  if (mins == null) return hhmm || "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function finalizeSlots(slots) {
  const list = (slots || [])
    .map((s) => ({ id: String(s.id), start: formatTime(s.start) }))
    .filter((s) => s.id && timeToMinutes(s.start) != null)
    .sort((a, b) => Number(a.id) - Number(b.id));

  return list.map((s, i) => ({
    id: s.id,
    start: s.start,
    end: list[i + 1] ? list[i + 1].start : LAST_SLOT_END,
  }));
}

export function isSlotActive(slot, date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  const start = timeToMinutes(slot.start);
  const end = timeToMinutes(slot.end);
  if (start == null || end == null) return false;
  return now >= start && now < end;
}

function splitTitleDesc(inner) {
  const idx = inner.indexOf("|");
  if (idx === -1) return { title: inner.trim(), subtitle: "" };
  return {
    title: inner.slice(0, idx).trim(),
    subtitle: inner.slice(idx + 1).trim().slice(0, DESC_MAX),
  };
}

function classifyMarker(marker) {
  const m = marker.toLowerCase().replace(/х/g, "x").replace(/\s+/g, "");
  if (m === "[]") return { kind: "daily", hasSubs: false };
  if (m === "[x]") return { kind: "once", hasSubs: false };
  if (m === "[xx]") return { kind: "weekly", hasSubs: false };
  if (m === "[{}]") return { kind: "group", hasSubs: true };
  return null;
}

const DAY_RE = /^\(\s*([^)]+?)\s*\)\s*$/u;
const SLOT_RE = /^@\[(\d+)\]\s*\{\s*(\d{1,2}:\d{2})\s*\}\s*$/u;
const LIST_REF_SLOT_RE = /^\[\{(\d+)\}\]\s*@\((\d+)\)\s*$/u;
const LIST_REF_RE = /^\[\{(\d+)\}\]\s*$/u;
const LIST_DEF_RE = /^\[\{(\d+)\}\]\s*\{\s*(.*?)\s*\}\s*$/u;
const TASK_SLOT_RE = /^(\[[^\]]*\])\s*@\((\d+)\)\s*\{\s*(.*?)\s*\}\s*$/u;
const TASK_RE = /^(\[[^\]]*\])\s*\{\s*(.*?)\s*\}\s*$/u;
const SUB_RE = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/u;

export function parseTaskCode(text) {
  const days = Object.fromEntries(DAYS.map((d) => [d, emptyDay()]));
  const lists = {};
  let current = null;
  let lastParent = null;
  let lastList = null;

  for (const rawLine of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\t/g, "    ");
    if (!line.trim()) continue;

    const dayMatch = line.trim().match(DAY_RE);
    if (dayMatch) {
      current = normalizeDay(dayMatch[1]);
      lastParent = null;
      lastList = null;
      continue;
    }

    const subMatch = line.match(SUB_RE);
    if (subMatch && (lastParent || lastList)) {
      const { title, subtitle } = splitTitleDesc(subMatch[1]);
      const sub = { title, subtitle, status: 0 };
      if (lastList) lastList.tasks.push(sub);
      else lastParent.tasks.push(sub);
      continue;
    }

    const trimmed = line.trim();

    const slotMatch = trimmed.match(SLOT_RE);
    if (slotMatch && current) {
      days[current].slots.push({
        id: slotMatch[1],
        start: formatTime(slotMatch[2]),
      });
      lastParent = null;
      lastList = null;
      continue;
    }

    const listDef = trimmed.match(LIST_DEF_RE);
    if (listDef) {
      const listId = listDef[1];
      const { title, subtitle } = splitTitleDesc(listDef[2]);
      lists[listId] = {
        title: title || `Список ${listId}`,
        subtitle,
        status: 0,
        tasks: [],
      };
      lastList = lists[listId];
      lastParent = null;
      continue;
    }

    const listRefSlot = trimmed.match(LIST_REF_SLOT_RE);
    if (listRefSlot && current) {
      days[current].items.push({
        title: "",
        subtitle: "",
        status: 0,
        kind: "listref",
        listId: listRefSlot[1],
        slotId: listRefSlot[2],
        tasks: [],
      });
      lastParent = null;
      lastList = null;
      continue;
    }

    const listRef = trimmed.match(LIST_REF_RE);
    if (listRef && current) {
      days[current].items.push({
        title: "",
        subtitle: "",
        status: 0,
        kind: "listref",
        listId: listRef[1],
        slotId: null,
        tasks: [],
      });
      lastParent = null;
      lastList = null;
      continue;
    }

    const taskSlot = trimmed.match(TASK_SLOT_RE);
    if (taskSlot && current) {
      const meta = classifyMarker(taskSlot[1]);
      if (!meta) {
        lastParent = null;
        lastList = null;
        continue;
      }
      const { title, subtitle } = splitTitleDesc(taskSlot[3]);
      const item = {
        title,
        subtitle: meta.hasSubs ? "" : subtitle,
        status: 0,
        kind: meta.kind,
        slotId: taskSlot[2],
        tasks: [],
      };
      days[current].items.push(item);
      lastParent = meta.hasSubs ? item : null;
      lastList = null;
      continue;
    }

    const taskMatch = trimmed.match(TASK_RE);
    if (taskMatch && current) {
      const meta = classifyMarker(taskMatch[1]);
      if (!meta) {
        lastParent = null;
        lastList = null;
        continue;
      }
      const { title, subtitle } = splitTitleDesc(taskMatch[2]);
      const item = {
        title,
        subtitle: meta.hasSubs ? "" : subtitle,
        status: 0,
        kind: meta.kind,
        slotId: null,
        tasks: [],
      };
      days[current].items.push(item);
      lastParent = meta.hasSubs ? item : null;
      lastList = null;
      continue;
    }

    lastParent = null;
    lastList = null;
  }

  for (const d of DAYS) {
    days[d].slots = finalizeSlots(days[d].slots);
  }

  return { days, lists };
}

function markerFor(item) {
  if (item.kind === "listref") return null;
  if (item.tasks?.length || item.kind === "group") return "[{}]";
  if (item.kind === "once") return "[x]";
  if (item.kind === "weekly") return "[xx]";
  return "[]";
}

function formatTitle(title, subtitle) {
  const t = title || "";
  const s = (subtitle || "").trim();
  return s ? `${t} | ${s}` : t;
}

function slotAttr(item) {
  return item.slotId != null && item.slotId !== "" ? ` @(${item.slotId})` : "";
}

export function serializeToCode(store) {
  const lines = [];
  for (const day of DAYS) {
    lines.push(`(${day})`);
    const dayData = ensureDay(store, day);
    const slots = finalizeSlots(dayData.slots);
    for (const slot of slots) {
      lines.push(`@[${slot.id}] {${slot.start}}`);
    }
    for (const item of dayData.items || []) {
      if (item.kind === "listref" && item.listId) {
        lines.push(`[{${item.listId}}]${slotAttr(item)}`);
        continue;
      }
      const hasSubs = item.tasks?.length > 0;
      if (hasSubs || item.kind === "group") {
        lines.push(`[{}]${slotAttr(item)} { ${item.title || ""} }`);
        for (const sub of item.tasks || []) {
          lines.push(`    - { ${formatTitle(sub.title, sub.subtitle)} }`);
        }
      } else {
        const mark = markerFor(item);
        lines.push(`${mark}${slotAttr(item)} { ${formatTitle(item.title, item.subtitle)} }`);
      }
    }
    lines.push("");
  }

  const listIds = Object.keys(store.lists || {}).sort((a, b) => Number(a) - Number(b));
  for (const id of listIds) {
    const list = store.lists[id];
    lines.push(`[{${id}}] { ${formatTitle(list.title, list.subtitle)} }`);
    for (const sub of list.tasks || []) {
      lines.push(`    - { ${formatTitle(sub.title, sub.subtitle)} }`);
    }
    lines.push("");
  }

  return (lines.join("\n").trim() + "\n").replace(/^\n+/, "");
}

export function resolveDayItems(store, dayName) {
  return getDayItems(store, dayName).map((item, index) => {
    if (item.kind === "listref" && item.listId != null) {
      const list = store.lists?.[String(item.listId)];
      if (!list) {
        return {
          ...item,
          index,
          title: `Список ${item.listId}`,
          subtitle: "",
          status: item.status ? 1 : 0,
          tasks: [],
          resolved: false,
          fromList: true,
        };
      }
      return {
        ...item,
        index,
        title: list.title,
        subtitle: list.subtitle || "",
        status: item.status ? 1 : 0,
        tasks: (list.tasks || []).map((t) => ({ ...t })),
        resolved: true,
        fromList: true,
      };
    }
    return {
      ...item,
      index,
      subtitle: item.subtitle || "",
      status: item.status ? 1 : 0,
      tasks: (item.tasks || []).map((t) => ({ ...t, status: t.status ? 1 : 0 })),
      fromList: false,
    };
  });
}

/** Слоты по номеру; задачи внутри — порядок массива дня. Пустой слот → items []. */
export function groupDayBySlots(store, dayName) {
  const slots = finalizeSlots(getDaySlots(store, dayName));
  const items = resolveDayItems(store, dayName);

  if (!slots.length) {
    if (!items.length) return [];
    return [{ id: "_", start: null, end: null, active: false, items }];
  }

  const now = new Date();
  return slots.map((slot) => ({
    ...slot,
    active: isSlotActive(slot, now),
    items: items.filter((it) => String(it.slotId) === String(slot.id)),
  }));
}

export function itemIsDone(item) {
  if (item.kind === "listref" || item.fromList) {
    return !!item.status;
  }
  if (item.tasks?.length) {
    if (item.status) return true;
    return item.tasks.every((t) => !!t.status);
  }
  return !!item.status;
}

export function setItemStatus(store, dayName, itemIndex, status, subIndex = null) {
  const items = getDayItems(store, dayName);
  const raw = items[itemIndex];
  if (!raw) return;

  if (raw.kind === "listref" && raw.listId != null) {
    const list = store.lists?.[String(raw.listId)];
    if (subIndex == null) {
      raw.status = status ? 1 : 0;
      return;
    }
    if (!list?.tasks?.[subIndex]) return;
    list.tasks[subIndex].status = status ? 1 : 0;
    return;
  }

  if (subIndex == null) {
    raw.status = status ? 1 : 0;
    if (raw.tasks?.length) {
      for (const t of raw.tasks) t.status = status ? 1 : 0;
    }
  } else if (raw.tasks?.[subIndex]) {
    raw.tasks[subIndex].status = status ? 1 : 0;
    raw.status = raw.tasks.every((t) => t.status) ? 1 : 0;
  }
}

function mergeItemStatus(prev, next) {
  if (!prev) return next;
  if (next.kind === "listref") {
    return { ...next, status: prev.status ? 1 : 0 };
  }
  const byTitle = new Map((prev.tasks || []).map((t) => [t.title, t]));
  return {
    ...next,
    status: prev.status ? 1 : next.status ? 1 : 0,
    subtitle: next.subtitle || prev.subtitle || "",
    slotId: next.slotId != null ? next.slotId : prev.slotId ?? null,
    tasks: (next.tasks || []).map((t) => {
      const p = byTitle.get(t.title);
      return {
        ...t,
        status: p?.status ? 1 : t.status ? 1 : 0,
        subtitle: t.subtitle || p?.subtitle || "",
      };
    }),
  };
}

export function applyCode(store, codeText) {
  const parsed = parseTaskCode(codeText);
  for (const day of DAYS) {
    const prevItems = getDayItems(store, day);
    const nextItems = (parsed.days[day]?.items || []).map((item) => {
      if (item.kind === "listref") {
        const p = prevItems.find(
          (x) => x.kind === "listref" && String(x.listId) === String(item.listId)
        );
        return { ...item, status: p?.status ? 1 : 0 };
      }
      const p = prevItems.find((x) => x.kind !== "listref" && x.title === item.title);
      return mergeItemStatus(p, item);
    });
    store[day] = {
      slots: finalizeSlots(parsed.days[day]?.slots || []),
      items: nextItems,
    };
  }

  const prevLists = store.lists || {};
  const nextLists = {};
  for (const [id, list] of Object.entries(parsed.lists || {})) {
    const prev = prevLists[id];
    if (!prev) {
      nextLists[id] = list;
      continue;
    }
    const byTitle = new Map((prev.tasks || []).map((t) => [t.title, t]));
    nextLists[id] = {
      title: list.title,
      subtitle: list.subtitle || "",
      status: prev.status ? 1 : 0,
      tasks: (list.tasks || []).map((t) => {
        const p = byTitle.get(t.title);
        return {
          title: t.title,
          subtitle: t.subtitle || p?.subtitle || "",
          status: p?.status ? 1 : 0,
        };
      }),
    };
  }
  store.lists = nextLists;
  return store;
}

/** Миграция старого store v1 / плоских массивов дней → { slots, items } */
export function migrateFromV1(old) {
  const store = emptyStore();
  store.streak = {
    count: old.streak?.count || 0,
    lastSuccessDate: old.streak?.lastSuccessDate || null,
    history: { ...(old.streak?.history || {}) },
    statusWeek: old.streak?.statusWeek || null,
  };

  for (const [id, list] of Object.entries(old.lists || {})) {
    const parentDone =
      !!old.listCompletions?.[`alist_${id}`] ||
      !!old.listCompletions?.[`list_${id}`];
    const tasks = (list.subtasks || list.tasks || []).map((s) => ({
      title: s.title,
      subtitle: s.description || s.subtitle || "",
      status:
        old.listCompletions?.[s.id] || s.status
          ? 1
          : 0,
    }));
    store.lists[id] = {
      title: list.title,
      subtitle: list.description || list.subtitle || "",
      status: parentDone || list.status || (tasks.length && tasks.every((t) => t.status)) ? 1 : 0,
      tasks,
    };
  }

  // уже v2 с массивами дней
  if (DAYS.some((d) => Array.isArray(old[d]) || old[d]?.items)) {
    for (const d of DAYS) {
      const raw = old[d];
      if (Array.isArray(raw)) {
        store[d] = { slots: [], items: raw.map((x) => ({ ...x })) };
      } else if (raw?.items) {
        store[d] = {
          slots: finalizeSlots(raw.slots || []),
          items: (raw.items || []).map((x) => ({ ...x })),
        };
      }
    }
    return store;
  }

  if (old.template) {
    const parsed = parseTaskCode(old.template);
    for (const d of DAYS) {
      store[d] = {
        slots: finalizeSlots(parsed.days[d]?.slots || []),
        items: (parsed.days[d]?.items || []).map((item) => ({
          ...item,
          tasks: (item.tasks || []).map((t) => ({ ...t })),
        })),
      };
    }
    for (const [id, list] of Object.entries(parsed.lists || {})) {
      if (!store.lists[id]) store.lists[id] = list;
    }
  }

  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const dayName = DAYS[i];
    const todayIdx = jsDayToIndex(today.getDay());
    const delta = i - todayIdx;
    const date = addDays(today, delta);
    const dateKey = toDateKey(date);
    const doneMap = old.completions?.[dateKey] || {};
    const template = old.days?.[dayName] || [];
    const extras = old.extraTasks?.[dateKey] || [];

    const materialize = (t) => {
      if (
        t.kind === "listref" ||
        t.kind === "adaptive" ||
        (t.listId != null &&
          t.kind !== "once" &&
          t.kind !== "weekly" &&
          t.kind !== "daily" &&
          t.kind !== "group")
      ) {
        return {
          title: "",
          subtitle: "",
          status: 0,
          kind: "listref",
          listId: String(t.listId),
          slotId: t.slotId ?? null,
          tasks: [],
        };
      }
      const tasks = (t.subtasks || []).map((s) => ({
        title: s.title,
        subtitle: s.description || "",
        status: doneMap[s.id] ? 1 : 0,
      }));
      let status = doneMap[t.id] ? 1 : 0;
      if (tasks.length && tasks.every((x) => x.status)) status = 1;
      return {
        title: t.title,
        subtitle: t.description || "",
        status,
        kind: t.kind === "once" || t.kind === "weekly" ? t.kind : tasks.length ? "group" : "daily",
        slotId: t.slotId ?? null,
        tasks,
      };
    };

    const fromOld = [...extras.map(materialize), ...template.map(materialize)];
    const day = ensureDay(store, dayName);

    if (day.items.length && fromOld.length) {
      const byTitle = new Map(
        fromOld.filter((x) => x.kind !== "listref").map((x) => [x.title, x])
      );
      day.items = day.items.map((item) => {
        if (item.kind === "listref") return item;
        const p = byTitle.get(item.title);
        if (!p) return item;
        byTitle.delete(item.title);
        return mergeItemStatus(p, item);
      });
      for (const p of byTitle.values()) day.items.push(p);
    } else if (fromOld.length && !day.items.length) {
      day.items = fromOld;
    }
  }

  return store;
}

export function isV2(data) {
  if (!data) return false;
  if (data.version === 2) return true;
  return DAYS.every((d) => Array.isArray(data[d]) || (data[d] && Array.isArray(data[d].items)));
}
