/**
 * Хранилище только через Cloudflare KV (/api/data).
 * Без localStorage.
 */

import { emptyStore, parseTaskCode } from "./parser.js";

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
  if (!res.ok) {
    throw new Error(`KV read failed: ${res.status}`);
  }
  return res.json();
}

async function apiPut(store) {
  const res = await fetch(`/api/data${userQuery()}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(store),
  });
  if (!res.ok) {
    throw new Error(`KV write failed: ${res.status}`);
  }
  return res.json();
}

export async function loadStore() {
  const payload = await apiGet();
  if (payload.exists && payload.data) {
    return migrate(payload.data);
  }

  // Пустая KV — один раз засеять пример и сохранить в KV
  try {
    const res = await fetch("./tasks.example.txt");
    if (res.ok) {
      const text = await res.text();
      const store = emptyStore();
      const parsed = parseTaskCode(text);
      store.template = parsed.template;
      store.days = parsed.days;
      await saveStore(store);
      return store;
    }
  } catch (_) {}

  return emptyStore();
}

export async function saveStore(store) {
  store.updatedAt = new Date().toISOString();
  await apiPut(store);
}

function migrate(data) {
  const base = emptyStore();
  const order = { ...(data.order || {}) };
  // убрать порядок по имени дня — он путал недели
  for (const key of Object.keys(order)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) delete order[key];
  }
  return {
    ...base,
    ...data,
    days: { ...base.days, ...(data.days || {}) },
    completions: data.completions || {},
    onceDone: data.onceDone || {},
    extraTasks: data.extraTasks || {},
    order,
    streak: { ...base.streak, ...(data.streak || {}) },
    meta: { ...(data.meta || {}) },
  };
}

export function applyTemplate(store, codeText) {
  const parsed = parseTaskCode(codeText);
  store.template = parsed.template;
  store.days = parsed.days;
  for (const key of Object.keys(store.order)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) delete store.order[key];
  }
  return store;
}
