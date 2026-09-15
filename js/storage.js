/**
 * Cloudflare KV — store v2 (дни + lists + streak).
 */

import {
  emptyStore,
  parseTaskCode,
  applyCode,
  serializeToCode,
  migrateFromV1,
  isV2,
  DAYS,
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

function normalize(data) {
  if (!data) return emptyStore();
  if (isV2(data) && data.version === 2) {
    const store = emptyStore();
    for (const d of DAYS) store[d] = Array.isArray(data[d]) ? data[d] : [];
    store.lists = data.lists || {};
    store.streak = { ...store.streak, ...(data.streak || {}) };
    store.version = 2;
    store.updatedAt = data.updatedAt || null;
    return store;
  }
  // v1 → v2
  if (data.days || data.template || data.completions || data.extraTasks) {
    return migrateFromV1(data);
  }
  // already day-keyed without version
  if (DAYS.some((d) => Array.isArray(data[d]))) {
    const store = emptyStore();
    for (const d of DAYS) store[d] = Array.isArray(data[d]) ? data[d] : [];
    store.lists = data.lists || {};
    store.streak = { ...store.streak, ...(data.streak || {}) };
    store.version = 2;
    return store;
  }
  return migrateFromV1(data);
}

export async function loadStore() {
  const payload = await apiGet();
  if (payload.exists && payload.data) {
    const store = normalize(payload.data);
    // сразу сохранить в новом формате, если была миграция
    if (payload.data.version !== 2) {
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
  // убрать legacy-поля если вдруг остались
  const clean = emptyStore();
  for (const d of DAYS) clean[d] = store[d] || [];
  clean.lists = store.lists || {};
  clean.streak = store.streak || clean.streak;
  clean.version = 2;
  clean.updatedAt = store.updatedAt;
  await apiPut(clean);
  // синхронизировать ссылку
  Object.assign(store, clean);
}

export function applyTemplate(store, codeText) {
  applyCode(store, codeText);
  return store;
}

export function getCodeText(store) {
  return serializeToCode(store);
}

export { parseTaskCode, serializeToCode };
