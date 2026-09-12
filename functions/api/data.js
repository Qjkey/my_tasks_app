/**
 * Cloudflare Pages Function — чтение/запись данных планера в KV.
 * Ключ: planer:{telegramUserId}
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function parseUserId(request) {
  const initData = request.headers.get("X-Telegram-Init-Data") || "";
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      if (user?.id) return String(user.id);
    } catch (_) {}
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("userId");
  return q || "local";
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.PLANER_KV) {
    return json({ error: "KV binding PLANER_KV is missing" }, 500);
  }
  const userId = parseUserId(request);
  const key = `planer:${userId}`;
  const raw = await env.PLANER_KV.get(key);
  if (!raw) {
    return json({ exists: false, data: null });
  }
  try {
    return json({ exists: true, data: JSON.parse(raw) });
  } catch {
    return json({ exists: false, data: null });
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.PLANER_KV) {
    return json({ error: "KV binding PLANER_KV is missing" }, 500);
  }
  const userId = parseUserId(request);
  const key = `planer:${userId}`;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  await env.PLANER_KV.put(key, JSON.stringify(body));
  return json({ ok: true });
}
