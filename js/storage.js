/**
 * Cloudflare KV — store v2 (дни {slots,items} + lists + streak).
 */

import {
  emptyStore,
  emptyDay,
  parseTaskCode,
  applyCode,
  serializeToCode,
  migrateFromV1,
  isV2,
  DAYS,
  finalizeSlots,
  ensureDay,
} from "./model.js";

function tg() {
  return window.Telegram?.WebApp || null;
}

function headers() {
  const h = { "Content-Type": "application/json" };
  const initData = tg()?.initData;
  if (initData) h["X-Telegram-Init-Data"] = initData;
  return h;
}

function userQuery() {
  const user = tg()?.initDataUnsafe?.user;
  if (user?.id) return `?userId=${user.id}`;
  return "?userId=local";
}

async function apiGet() {
  const res = await fetch(`/api/data${userQuery()}`, { headers: headers() });
  if (!res.ok) throw new Error(`KV read failed: ${res.status}`);
  return res.json();
}

async function apiPut(store) {
  const res = await fetch(`/api/data${userQuery()}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(store),
  });
  if (!res.ok) throw new Error(`KV write failed: ${res.status}`);
  return res.json();
}

function normalizeDayData(raw) {
  if (!raw) return emptyDay();
  if (Array.isArray(raw)) return { slots: [], items: raw };
  return {
    slots: finalizeSlots(raw.slots || []),
    items: Array.isArray(raw.items) ? raw.items : [],
  };
}

function normalize(data) {
  if (!data) return emptyStore();
  if (isV2(data)) {
    const store = emptyStore();
    for (const d of DAYS) store[d] = normalizeDayData(data[d]);
    store.lists = data.lists || {};
    store.streak = { ...store.streak, ...(data.streak || {}) };
    store.version = 2;
    store.updatedAt = data.updatedAt || null;
    return store;
  }
  if (data.days || data.template || data.completions || data.extraTasks) {
    return migrateFromV1(data);
  }
  return migrateFromV1(data);
}

export async function loadStore() {
  const payload = await apiGet();
  if (payload.exists && payload.data) {
    const store = normalize(payload.data);
    const needsRewrite =
      payload.data.version !== 2 ||
      DAYS.some((d) => Array.isArray(payload.data[d]));
    if (needsRewrite) {
      try {
        await saveStore(store);
      } catch (_) {}
    }
    return store;
  }

  try {
    const res = await fetch("./tasks.example.txt");
    if (res.ok) {
      const text = await res.text();
      const store = emptyStore();
      applyCode(store, text);
      await saveStore(store);
      return store;
    }
  } catch (_) {}

  return emptyStore();
}

export async function saveStore(store) {
  store.version = 2;
  store.updatedAt = new Date().toISOString();
  const clean = emptyStore();
  for (const d of DAYS) {
    const day = ensureDay(store, d);
    clean[d] = {
      slots: finalizeSlots(day.slots),
      items: day.items || [],
    };
  }

  // пустые черновики не пишем в KV, но оставляем в памяти
  const emptyDrafts = {};
  clean.lists = {};
  for (const [id, list] of Object.entries(store.lists || {})) {
    if (list.draft && !(list.tasks && list.tasks.length)) {
      emptyDrafts[id] = list;
      continue;
    }
    const { draft, ...rest } = list;
    clean.lists[id] = rest;
  }

  clean.streak = store.streak || clean.streak;
  clean.version = 2;
  clean.updatedAt = store.updatedAt;
  await apiPut(clean);
  Object.assign(store, clean);
  Object.assign(store.lists, emptyDrafts);
}

export function applyTemplate(store, codeText) {
  applyCode(store, codeText);
  return store;
}

export function getCodeText(store) {
  return serializeToCode(store);
}

export { parseTaskCode, serializeToCode };
