/**
 * Хранилище: Cloudflare KV через /api/data + fallback localStorage.
 */

import { emptyStore, parseTaskCode } from "./parser.js";

const LS_KEY = "planer_store_v1";

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

export async function loadStore() {
  try {
    const res = await fetch(`/api/data${userQuery()}`, { headers: headers() });
    if (res.ok) {
      const payload = await res.json();
      if (payload.exists && payload.data) {
        const data = migrate(payload.data);
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        return data;
      }
    }
  } catch (_) {
    /* offline / no worker */
  }

  const cached = localStorage.getItem(LS_KEY);
  if (cached) {
    try {
      return migrate(JSON.parse(cached));
    } catch (_) {}
  }

  // Первичная загрузка примера
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
  localStorage.setItem(LS_KEY, JSON.stringify(store));

  try {
    await fetch(`/api/data${userQuery()}`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(store),
    });
  } catch (_) {
    /* keep local */
  }
}

function migrate(data) {
  const base = emptyStore();
  return {
    ...base,
    ...data,
    days: { ...base.days, ...(data.days || {}) },
    completions: data.completions || {},
    onceDone: data.onceDone || {},
    extraTasks: data.extraTasks || {},
    order: data.order || {},
    streak: { ...base.streak, ...(data.streak || {}) },
  };
}

export function applyTemplate(store, codeText) {
  const parsed = parseTaskCode(codeText);
  store.template = parsed.template;
  store.days = parsed.days;
  // сбрасываем порядок по дням недели (не по датам) — шаблон изменился
  for (const key of Object.keys(store.order)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) delete store.order[key];
  }
  return store;
}
