/**
 * Модель данных v2
 *
 * KV (один JSON на пользователя):
 * {
 *   version: 2,
 *   понедельник: [ Item, ... ],
 *   ...
 *   воскресенье: [ Item, ... ],
 *   lists: { "1": List, "2": List },
 *   streak: { count, lastSuccessDate, history }
 * }
 *
 * Item: { title, subtitle, status: 0|1, kind?, listId?, tasks?: Sub[] }
 * Sub:  { title, subtitle, status: 0|1 }
 * List: { title, subtitle, status, tasks: Sub[] }
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

export function emptyStore() {
  const store = {
    version: 2,
    lists: {},
    streak: { count: 0, lastSuccessDate: null, history: {} },
    updatedAt: null,
  };
  for (const d of DAYS) store[d] = [];
  return store;
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
const LIST_REF_RE = /^\[\{(\d+)\}\]\s*$/u;
const LIST_DEF_RE = /^\[\{(\d+)\}\]\s*\{\s*(.*?)\s*\}\s*$/u;
const TASK_RE = /^(\[[^\]]*\])\s*\{\s*(.*?)\s*\}\s*$/u;
const SUB_RE = /^\s*-\s*\{\s*(.*?)\s*\}\s*$/u;

/** Разобрать код → { days, lists } без статусов (status=0) */
export function parseTaskCode(text) {
  const days = Object.fromEntries(DAYS.map((d) => [d, []]));
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

    const listRef = trimmed.match(LIST_REF_RE);
    if (listRef && current) {
      days[current].push({
        title: "",
        subtitle: "",
        status: 0,
        kind: "listref",
        listId: listRef[1],
        tasks: [],
      });
      lastParent = null;
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
        tasks: [],
      };
      days[current].push(item);
      lastParent = meta.hasSubs ? item : null;
      lastList = null;
      continue;
    }

    lastParent = null;
    lastList = null;
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

/** Сериализация всего store в код (дни + списки + UI-задачи) */
export function serializeToCode(store) {
  const lines = [];
  for (const day of DAYS) {
    lines.push(`(${day})`);
    for (const item of store[day] || []) {
      if (item.kind === "listref" && item.listId) {
        lines.push(`[{${item.listId}}]`);
        continue;
      }
      const hasSubs = item.tasks?.length > 0;
      if (hasSubs || item.kind === "group") {
        lines.push(`[{}] { ${item.title || ""} }`);
        for (const sub of item.tasks || []) {
          lines.push(`    - { ${formatTitle(sub.title, sub.subtitle)} }`);
        }
      } else {
        const mark = markerFor(item);
        lines.push(`${mark} { ${formatTitle(item.title, item.subtitle)} }`);
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

/** Подтянуть listref из store.lists (живая ссылка на статусы) */
export function resolveDayItems(store, dayName) {
  return (store[dayName] || []).map((item, index) => {
    if (item.kind === "listref" && item.listId != null) {
      const list = store.lists?.[String(item.listId)];
      if (!list) {
        return {
          ...item,
          index,
          title: `Список ${item.listId}`,
          subtitle: "",
          status: 0,
          tasks: [],
          resolved: false,
        };
      }
      return {
        ...item,
        index,
        title: list.title,
        subtitle: list.subtitle || "",
        status: list.status ? 1 : 0,
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

export function itemIsDone(item) {
  if (item.tasks?.length) {
    if (item.status) return true;
    return item.tasks.every((t) => !!t.status);
  }
  return !!item.status;
}

/** Обновить status; для listref пишет в store.lists */
export function setItemStatus(store, dayName, itemIndex, status, subIndex = null) {
  const raw = store[dayName]?.[itemIndex];
  if (!raw) return;

  if (raw.kind === "listref" && raw.listId != null) {
    const list = store.lists?.[String(raw.listId)];
    if (!list) return;
    if (subIndex == null) {
      list.status = status ? 1 : 0;
      for (const t of list.tasks || []) t.status = status ? 1 : 0;
    } else if (list.tasks?.[subIndex]) {
      list.tasks[subIndex].status = status ? 1 : 0;
      list.status = list.tasks.every((t) => t.status) ? 1 : 0;
    }
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
  if (next.kind === "listref") return { ...next };
  const byTitle = new Map((prev.tasks || []).map((t) => [t.title, t]));
  return {
    ...next,
    status: prev.status ? 1 : next.status ? 1 : 0,
    subtitle: next.subtitle || prev.subtitle || "",
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

/**
 * Применить код: сохранить статусы по совпадению title / listId.
 */
export function applyCode(store, codeText) {
  const parsed = parseTaskCode(codeText);
  for (const day of DAYS) {
    const prev = store[day] || [];
    store[day] = (parsed.days[day] || []).map((item) => {
      if (item.kind === "listref") {
        const p = prev.find((x) => x.kind === "listref" && String(x.listId) === String(item.listId));
        return p ? { ...item } : item;
      }
      const p = prev.find((x) => x.kind !== "listref" && x.title === item.title);
      return mergeItemStatus(p, item);
    });
    // задачи, которые были только в UI и пропали из кода — оставляем в конце
    for (const p of prev) {
      if (p.kind === "listref") continue;
      const still = store[day].some((x) => x.kind !== "listref" && x.title === p.title);
      if (!still) store[day].push({ ...p });
    }
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
      subtitle: list.subtitle || prev.subtitle || "",
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
    // старые пункты списка, которых нет в коде — сохраняем
    for (const p of prev.tasks || []) {
      if (!nextLists[id].tasks.some((t) => t.title === p.title)) {
        nextLists[id].tasks.push({ ...p });
      }
    }
  }
  // списки только из UI (не в коде) — сохраняем
  for (const [id, list] of Object.entries(prevLists)) {
    if (!nextLists[id]) nextLists[id] = list;
  }
  store.lists = nextLists;
  return store;
}

/** Миграция старого store v1 → v2 */
export function migrateFromV1(old) {
  const store = emptyStore();
  store.streak = {
    count: old.streak?.count || 0,
    lastSuccessDate: old.streak?.lastSuccessDate || null,
    history: { ...(old.streak?.history || {}) },
  };

  // lists
  for (const [id, list] of Object.entries(old.lists || {})) {
    const parentDone =
      !!old.listCompletions?.[`alist_${id}`] ||
      !!old.listCompletions?.[`list_${id}`];
    const tasks = (list.subtasks || []).map((s) => ({
      title: s.title,
      subtitle: s.description || "",
      status:
        old.listCompletions?.[s.id] ||
        old.listCompletions?.[`als_${id}_${s.title}`]
          ? 1
          : 0,
    }));
    store.lists[id] = {
      title: list.title,
      subtitle: list.description || "",
      status: parentDone || (tasks.length && tasks.every((t) => t.status)) ? 1 : 0,
      tasks,
    };
  }

  // если есть template — база структуры из кода (чтобы не переписывать)
  if (old.template) {
    const parsed = parseTaskCode(old.template);
    for (const d of DAYS) {
      if (parsed.days[d]?.length) {
        // статусы наложим ниже из completions / days
        store[d] = parsed.days[d].map((item) => ({ ...item, tasks: (item.tasks || []).map((t) => ({ ...t })) }));
      }
    }
    for (const [id, list] of Object.entries(parsed.lists || {})) {
      if (!store.lists[id]) store.lists[id] = list;
      else {
        // дополнить пункты из кода, если библиотека была короче
        const have = new Set((store.lists[id].tasks || []).map((t) => t.title));
        for (const t of list.tasks || []) {
          if (!have.has(t.title)) store.lists[id].tasks.push({ ...t });
        }
        if (!store.lists[id].title) store.lists[id].title = list.title;
      }
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
    const order = old.order?.[dateKey] || null;

    const materialize = (t) => {
      if (t.kind === "listref" || t.kind === "adaptive" || (t.listId != null && t.kind !== "once" && t.kind !== "weekly" && t.kind !== "daily" && t.kind !== "group")) {
        return {
          title: "",
          subtitle: "",
          status: 0,
          kind: "listref",
          listId: String(t.listId),
          tasks: [],
        };
      }
      const subs = t.subtasks || [];
      const tasks = subs.map((s) => ({
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
        kind: t.kind === "once" || t.kind === "weekly" ? t.kind : subs.length ? "group" : "daily",
        tasks,
      };
    };

    let fromOld = [];
    if (order?.length) {
      const all = [...template, ...extras];
      const map = new Map(all.map((t) => [t.id, t]));
      for (const t of all) {
        if ((t.kind === "listref" || t.kind === "adaptive") && t.listId) {
          map.set(`alist_${t.listId}`, t);
        }
      }
      for (const id of order) {
        const t = map.get(id);
        if (t) {
          fromOld.push(materialize(t));
          map.delete(id);
          if (t.listId) map.delete(`alist_${t.listId}`);
          map.delete(t.id);
        }
      }
      for (const t of map.values()) fromOld.push(materialize(t));
    } else if (template.length || extras.length) {
      fromOld = [...extras.map(materialize), ...template.map(materialize)];
    }

    // если уже есть из template-кода — смержить статусы и UI-extras
    if (store[dayName]?.length && fromOld.length) {
      const byTitle = new Map(
        fromOld.filter((x) => x.kind !== "listref").map((x) => [x.title, x])
      );
      store[dayName] = store[dayName].map((item) => {
        if (item.kind === "listref") return item;
        const p = byTitle.get(item.title);
        if (!p) return item;
        byTitle.delete(item.title);
        return mergeItemStatus(p, item);
      });
      // extras / задачи, которых не было в template
      for (const p of byTitle.values()) {
        store[dayName].push(p);
      }
      // listref из fromOld, которых нет
      const haveList = new Set(
        store[dayName].filter((x) => x.kind === "listref").map((x) => String(x.listId))
      );
      for (const p of fromOld) {
        if (p.kind === "listref" && !haveList.has(String(p.listId))) {
          store[dayName].push(p);
          haveList.add(String(p.listId));
        }
      }
    } else if (fromOld.length) {
      const seenList = new Set();
      store[dayName] = fromOld.filter((item) => {
        if (item.kind === "listref") {
          if (seenList.has(item.listId)) return false;
          seenList.add(item.listId);
        }
        return true;
      });
    } else {
      // проставить статусы из doneMap по title для уже распарсенного template
      for (const item of store[dayName] || []) {
        if (item.kind === "listref") continue;
        const oldT = template.find((t) => t.title === item.title);
        if (!oldT) continue;
        if (doneMap[oldT.id]) item.status = 1;
        for (const s of item.tasks || []) {
          const os = (oldT.subtasks || []).find((x) => x.title === s.title);
          if (os && doneMap[os.id]) s.status = 1;
        }
        if (item.tasks?.length && item.tasks.every((t) => t.status)) item.status = 1;
      }
    }
  }

  return store;
}

export function isV2(data) {
  return data?.version === 2 || (data && DAYS.every((d) => Array.isArray(data[d])));
}
