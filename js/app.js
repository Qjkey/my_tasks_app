/**
 * Планер — UI на модели v2 (дни + lists в KV).
 */

import {
  DAYS,
  DAY_SHORT,
  DESC_MAX,
  capitalize,
  dayNameFromDate,
  toDateKey,
  emptyStore,
  resolveDayItems,
  setItemStatus,
  itemIsDone,
} from "./model.js";
import { loadStore, saveStore, applyTemplate, getCodeText } from "./storage.js";
import { evaluateStreak, weekStatus, pluralDays } from "./streak.js";
import { enableDragDrop } from "./dragdrop.js";

const DELETE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
</svg>`;

const CHEVRON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
  <polyline points="6 9 12 15 18 9"></polyline>
</svg>`;

const INFO_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
  <circle cx="12" cy="12" r="9"/><line x1="12" y1="10" x2="12" y2="16"/><circle cx="12" cy="7" r="0.8" fill="currentColor" stroke="none"/>
</svg>`;

const state = {
  store: null,
  selectedDay: dayNameFromDate(new Date()),
  editMode: false,
  expanded: new Set(),
  descOpen: new Set(),
  tab: "week",
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function tg() {
  return window.Telegram?.WebApp || null;
}

function initTelegram() {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand();
  document.body.classList.add("tg-expand");

  const secondary =
    w.themeParams?.secondary_bg_color ||
    getComputedStyle(document.documentElement).getPropertyValue("--tg-theme-secondary-bg-color").trim() ||
    "#1a1d21";
  try {
    w.setHeaderColor(secondary);
    w.setBackgroundColor(secondary);
  } catch (_) {}

  try {
    w.MainButton.hide();
  } catch (_) {}

  try {
    w.BackButton.hide();
    w.BackButton.onClick(() => setTab("week"));
  } catch (_) {}

  try {
    if (w.SettingsButton) {
      w.SettingsButton.show();
      w.SettingsButton.onClick(() => setTab("lists"));
    }
  } catch (_) {}
}

function syncTelegramChrome() {
  const w = tg();
  if (!w) return;
  try {
    if (state.tab === "streak" || state.tab === "lists") {
      w.BackButton.show();
      document.title = state.tab === "streak" ? "Огонёк" : "Списки";
    } else {
      w.BackButton.hide();
      document.title = "Планер";
    }
  } catch (_) {}
}

function itemId(index) {
  return `i${index}`;
}

function subId(index, subIndex) {
  return `i${index}_s${subIndex}`;
}

function listViewId(listId) {
  return `L${listId}`;
}

function listSubId(listId, subIndex) {
  return `L${listId}_s${subIndex}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDayMenu() {
  const menu = $("#day-menu");
  menu.innerHTML = DAYS.map(
    (d) =>
      `<button type="button" role="option" data-day="${d}" class="${d === state.selectedDay ? "selected" : ""}">${capitalize(d)}</button>`
  ).join("");
}

/** info рядом с названием (когда есть стрелка) */
function infoInline(id, hasDesc, placeTrailing) {
  if (!hasDesc || state.editMode || placeTrailing) return "";
  return `<button type="button" class="info-btn" data-desc-toggle="${id}" aria-label="Описание">${INFO_ICON}</button>`;
}

/** info на месте стрелки (нет подзадач) */
function infoTrailing(id, hasDesc) {
  if (!hasDesc || state.editMode) return "";
  return `<button type="button" class="info-btn trailing" data-desc-toggle="${id}" aria-label="Описание">${INFO_ICON}</button>`;
}

function descBlock(id, text) {
  if (!text) return "";
  const open = state.descOpen.has(id);
  return `<div class="task-desc ${open ? "open" : ""}" data-desc-for="${id}">
    <div class="task-desc-inner">${escapeHtml(text)}</div>
  </div>`;
}

function trailingSlot(opts) {
  const { id, hasSubs, hasDesc, deleteAttr } = opts;
  if (state.editMode) {
    return `<button type="button" class="delete-btn" ${deleteAttr} aria-label="Удалить">${DELETE_ICON}</button>`;
  }
  if (hasSubs) {
    return `<button type="button" class="expand-btn" data-expand="${id}" aria-label="Подзадачи">${CHEVRON_ICON}</button>`;
  }
  if (hasDesc) {
    return infoTrailing(id, true);
  }
  return `<span class="row-spacer"></span>`;
}

function renderTasks() {
  const list = $("#task-list");
  const items = resolveDayItems(state.store, state.selectedDay);

  $("#current-day-label").textContent = capitalize(state.selectedDay);

  if (state.editMode) {
    for (const item of items) {
      if (item.tasks?.length) state.expanded.add(itemId(item.index));
    }
  }

  list.innerHTML = items
    .map((item) => {
      const id = itemId(item.index);
      const hasSubs = item.tasks?.length > 0;
      const expanded = state.editMode ? hasSubs : state.expanded.has(id);
      const done = itemIsDone(item);
      const desc = item.subtitle || "";
      const showDesc = !!desc;

      const subs = hasSubs
        ? `<div class="subtasks"><div class="subtasks-inner">
            ${item.tasks
              .map((s, si) => {
                const sid = subId(item.index, si);
                const subDesc = s.subtitle || "";
                const subDone = !!s.status;
                return `<div class="sub-block" data-sub-wrap="${sid}">
                  <div class="task-row sub" data-item-index="${item.index}" data-sub-index="${si}">
                    <button type="button" class="check ${subDone ? "done" : ""}" data-toggle-item="${item.index}" data-toggle-sub="${si}" aria-label="Готово"></button>
                    <div class="title-wrap">
                      <span class="task-title ${subDone ? "done" : ""}">${escapeHtml(s.title)}</span>
                    </div>
                    ${
                      state.editMode
                        ? `<button type="button" class="delete-btn sub-delete" data-delete-item="${item.index}" data-delete-sub="${si}" aria-label="Удалить подзадачу">${DELETE_ICON}</button>`
                        : subDesc
                          ? infoTrailing(sid, true)
                          : `<span class="row-spacer"></span>`
                    }
                  </div>
                  ${descBlock(sid, subDesc)}
                </div>`;
              })
              .join("")}
          </div></div>`
        : "";

      return `<article class="task-card ${expanded ? "expanded" : ""}" data-id="${id}" data-index="${item.index}" data-kind="${item.kind || "daily"}">
        <div class="task-row">
          <button type="button" class="check ${done ? "done" : ""}" data-toggle-item="${item.index}" ${hasSubs ? 'data-parent-toggle="1"' : ""} aria-label="Готово"></button>
          <div class="title-wrap">
            <span class="task-title ${done ? "done" : ""}">${escapeHtml(item.title)}</span>
            ${infoInline(id, showDesc, !hasSubs)}
          </div>
          ${trailingSlot({
            id,
            hasSubs,
            hasDesc: showDesc,
            deleteAttr: `data-delete-item="${item.index}"`,
          })}
        </div>
        ${descBlock(id, desc)}
        ${subs}
      </article>`;
    })
    .join("");
}

function renderStreak() {
  evaluateStreak(state.store, new Date());
  const streak = state.store.streak;
  const countEl = $("#streak-count");
  if (countEl) countEl.textContent = pluralDays(streak.count || 0);

  const head = $("#week-calendar-head");
  const row = $("#week-calendar-row");
  if (!head || !row) return;

  head.innerHTML = DAY_SHORT.map((d) => `<span>${d}</span>`).join("");

  const todayKey = toDateKey(new Date());
  const days = weekStatus(state.store, new Date());
  row.innerHTML = days
    .map((d) => {
      const cls = [
        "day-dot",
        d.status === "done" ? "done" : "",
        d.status === "missed" ? "missed" : "",
        d.key === todayKey ? "today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="${cls}" title="${d.key}"></div>`;
    })
    .join("");
}

function setTab(tab) {
  state.tab = tab;
  $("#tab-week")?.classList.toggle("active", tab === "week");
  $("#tab-streak")?.classList.toggle("active", tab === "streak");
  $("#tab-lists")?.classList.toggle("active", tab === "lists");
  syncTelegramChrome();
  if (tab === "streak") renderStreak();
  if (tab === "lists") renderLists();
  if (tab === "week") renderTasks();
}

function renderLists() {
  const root = $("#lists-root");
  if (!root) return;

  const entries = Object.entries(state.store.lists || {}).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );

  if (!entries.length) {
    root.innerHTML = `<p class="lists-empty">Пока нет адаптивных списков.<br/>В коде после дней добавьте:<br/><code>[{1}] { Покупки }</code><br/><code>    - { Молоко }</code><br/>А в дне закрепите: <code>[{1}]</code></p>`;
    return;
  }

  root.innerHTML = entries
    .map(([listId, list]) => {
      const id = listViewId(listId);
      const open = state.expanded.has(id);
      const tasks = list.tasks || [];
      const done =
        !!list.status || (tasks.length > 0 && tasks.every((t) => t.status));

      return `<article class="task-card ${open ? "expanded" : ""}" data-id="${id}" data-list-id="${listId}" data-kind="list">
        <div class="task-row">
          <button type="button" class="check ${done ? "done" : ""}" data-list-toggle="${listId}" data-parent-toggle="1" aria-label="Готово"></button>
          <div class="title-wrap">
            <span class="task-title ${done ? "done" : ""}">${escapeHtml(list.title)}</span>
            ${infoInline(id, !!list.subtitle, tasks.length === 0)}
          </div>
          ${
            tasks.length
              ? `<button type="button" class="expand-btn" data-expand="${id}" aria-label="Пункты">${CHEVRON_ICON}</button>`
              : list.subtitle
                ? infoTrailing(id, true)
                : `<span class="row-spacer"></span>`
          }
        </div>
        ${descBlock(id, list.subtitle || "")}
        <div class="subtasks"><div class="subtasks-inner">
          ${
            tasks
              .map((s, si) => {
                const sid = listSubId(listId, si);
                const subDesc = s.subtitle || "";
                return `<div class="sub-block">
                  <div class="task-row sub" data-list-id="${listId}" data-sub-index="${si}">
                    <button type="button" class="check ${s.status ? "done" : ""}" data-list-toggle="${listId}" data-list-sub="${si}" aria-label="Готово"></button>
                    <div class="title-wrap">
                      <span class="task-title ${s.status ? "done" : ""}">${escapeHtml(s.title)}</span>
                    </div>
                    ${
                      subDesc
                        ? infoTrailing(sid, true)
                        : `<span class="row-spacer"></span>`
                    }
                  </div>
                  ${descBlock(sid, subDesc)}
                </div>`;
              })
              .join("") || `<p class="lists-empty soft">Пустой список</p>`
          }
        </div></div>
      </article>`;
    })
    .join("");
}

function toggleEdit(force) {
  state.editMode = typeof force === "boolean" ? force : !state.editMode;
  document.body.classList.toggle("edit-mode", state.editMode);
  $("#btn-edit").classList.toggle("active", state.editMode);
  $("#edit-toolbar").classList.toggle("hidden", !state.editMode);
  renderTasks();
}

function playPressAnim(card) {
  if (!card || card.classList.contains("dragging")) return;
  card.classList.remove("press-anim");
  void card.offsetWidth;
  card.classList.add("press-anim");
  const done = () => {
    card.classList.remove("press-anim");
    card.removeEventListener("animationend", done);
  };
  card.addEventListener("animationend", done);
}

function refreshDoneUI() {
  const items = resolveDayItems(state.store, state.selectedDay);
  for (const item of items) {
    const card = $(`.task-card[data-index="${item.index}"]`);
    if (!card) continue;
    const done = itemIsDone(item);
    const mainCheck = card.querySelector(":scope > .task-row .check");
    const mainTitle = card.querySelector(":scope > .task-row .task-title");
    mainCheck?.classList.toggle("done", done);
    mainTitle?.classList.toggle("done", done);

    (item.tasks || []).forEach((s, si) => {
      const row = card.querySelector(`.task-row.sub[data-sub-index="${si}"]`);
      if (!row) return;
      row.querySelector(".check")?.classList.toggle("done", !!s.status);
      row.querySelector(".task-title")?.classList.toggle("done", !!s.status);
    });
  }
}

async function persist() {
  const before = state.store.streak?.count || 0;
  evaluateStreak(state.store, new Date());
  const after = state.store.streak?.count || 0;
  try {
    await saveStore(state.store);
  } catch (err) {
    console.error(err);
    tg()?.showAlert?.("Не удалось сохранить в KV. Проверьте привязку PLANER_KV.");
  }
  renderStreak();
  if (after > before) {
    tg()?.HapticFeedback?.notificationOccurred?.("success");
  }
}

function openModal(id) {
  $(`#${id}`).classList.remove("hidden");
}

function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
}

function openAddModal() {
  $("#add-task-input").value = "";
  $("#add-task-desc").value = "";
  openModal("modal-add");
  setTimeout(() => $("#add-task-input").focus(), 50);
}

function addTask(title, description = "") {
  title = title.trim();
  if (!title) return;
  description = String(description || "").trim().slice(0, DESC_MAX);
  const day = state.selectedDay;
  if (!state.store[day]) state.store[day] = [];
  state.store[day].unshift({
    title,
    subtitle: description,
    status: 0,
    kind: "once",
    tasks: [],
  });
  renderTasks();
  persist();
}

function deleteItem(index) {
  const day = state.selectedDay;
  const arr = state.store[day] || [];
  if (index < 0 || index >= arr.length) return;
  arr.splice(index, 1);
  state.expanded.clear();
  state.descOpen.clear();
  renderTasks();
  persist();
  tg()?.HapticFeedback?.impactOccurred?.("medium");
}

function deleteSub(itemIndex, subIndex) {
  const day = state.selectedDay;
  const raw = state.store[day]?.[itemIndex];
  if (!raw) return;

  if (raw.kind === "listref" && raw.listId != null) {
    const list = state.store.lists?.[String(raw.listId)];
    if (list?.tasks) list.tasks.splice(subIndex, 1);
  } else if (raw.tasks) {
    raw.tasks.splice(subIndex, 1);
  }

  renderTasks();
  persist();
  tg()?.HapticFeedback?.impactOccurred?.("medium");
}

function handleReorder({ fromId, toId, mode }) {
  const day = state.selectedDay;
  const arr = state.store[day] || [];
  const fromIdx = Number(String(fromId).replace(/^i/, ""));
  const toIdx = Number(String(toId).replace(/^i/, ""));
  if (Number.isNaN(fromIdx) || Number.isNaN(toIdx)) return;
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return;

  const [moved] = arr.splice(fromIdx, 1);
  // индексы после splice сдвигаются
  let targetIdx = toIdx;
  if (fromIdx < toIdx) targetIdx = toIdx - 1;

  if (mode === "into") {
    const parent = arr[targetIdx];
    if (!parent) {
      arr.splice(fromIdx, 0, moved);
      return;
    }
    if (parent.kind === "listref" && parent.listId != null) {
      const list = state.store.lists?.[String(parent.listId)];
      if (!list) {
        arr.splice(fromIdx, 0, moved);
        return;
      }
      if (!list.tasks) list.tasks = [];
      list.tasks.push({
        title: moved.title,
        subtitle: moved.subtitle || "",
        status: moved.status ? 1 : 0,
      });
      for (const t of moved.tasks || []) {
        list.tasks.push({
          title: t.title,
          subtitle: t.subtitle || "",
          status: t.status ? 1 : 0,
        });
      }
    } else {
      if (!parent.tasks) parent.tasks = [];
      parent.kind = parent.kind === "listref" ? parent.kind : "group";
      parent.tasks.push({
        title: moved.title,
        subtitle: moved.subtitle || "",
        status: moved.status ? 1 : 0,
      });
      for (const t of moved.tasks || []) {
        parent.tasks.push({
          title: t.title,
          subtitle: t.subtitle || "",
          status: t.status ? 1 : 0,
        });
      }
    }
    state.expanded.add(itemId(targetIdx));
  } else {
    let insertAt = targetIdx;
    if (mode === "after") insertAt += 1;
    arr.splice(insertAt, 0, moved);
  }

  renderTasks();
  persist();
}

function setListStatus(listId, status, subIndex = null) {
  const list = state.store.lists?.[String(listId)];
  if (!list) return;
  if (subIndex == null) {
    list.status = status ? 1 : 0;
    for (const t of list.tasks || []) t.status = status ? 1 : 0;
  } else if (list.tasks?.[subIndex]) {
    list.tasks[subIndex].status = status ? 1 : 0;
    list.status = list.tasks.every((t) => t.status) ? 1 : 0;
  }
}

function bindEvents() {
  $("#day-selector").addEventListener("click", () => {
    const menu = $("#day-menu");
    const open = menu.classList.toggle("hidden") === false;
    $("#day-selector").classList.toggle("open", open);
    $("#day-selector").setAttribute("aria-expanded", open ? "true" : "false");
  });

  $("#day-menu").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-day]");
    if (!btn) return;
    state.selectedDay = btn.dataset.day;
    $("#day-menu").classList.add("hidden");
    $("#day-selector").classList.remove("open");
    renderDayMenu();
    renderTasks();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#day-selector") && !e.target.closest("#day-menu")) {
      $("#day-menu").classList.add("hidden");
      $("#day-selector").classList.remove("open");
    }
  });

  $("#btn-edit").addEventListener("click", () => toggleEdit());
  $("#btn-done-edit").addEventListener("click", () => toggleEdit(false));
  $("#btn-add-task").addEventListener("click", () => openAddModal());
  $("#btn-to-streak").addEventListener("click", () => setTab("streak"));

  $("#task-list").addEventListener("click", (e) => {
    const delSub = e.target.closest("[data-delete-sub]");
    if (delSub) {
      e.stopPropagation();
      deleteSub(Number(delSub.dataset.deleteItem), Number(delSub.dataset.deleteSub));
      return;
    }

    const del = e.target.closest("[data-delete-item]");
    if (del && !del.dataset.deleteSub) {
      e.stopPropagation();
      deleteItem(Number(del.dataset.deleteItem));
      return;
    }

    const descToggle = e.target.closest("[data-desc-toggle]");
    if (descToggle) {
      e.stopPropagation();
      const id = descToggle.dataset.descToggle;
      if (state.descOpen.has(id)) state.descOpen.delete(id);
      else state.descOpen.add(id);
      const block = $(`.task-desc[data-desc-for="${id}"]`);
      if (block) block.classList.toggle("open", state.descOpen.has(id));
      return;
    }

    if (state.editMode) return;

    const card = e.target.closest(".task-card");

    const expand = e.target.closest("[data-expand]");
    if (expand) {
      const id = expand.dataset.expand;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      if (card) {
        playPressAnim(card);
        card.classList.toggle("expanded", state.expanded.has(id));
      } else {
        renderTasks();
      }
      return;
    }

    const toggle = e.target.closest("[data-toggle-item]");
    if (toggle) {
      const index = Number(toggle.dataset.toggleItem);
      const sub = toggle.dataset.toggleSub;
      const items = resolveDayItems(state.store, state.selectedDay);
      const item = items.find((t) => t.index === index);
      if (!item) return;

      if (toggle.dataset.parentToggle === "1" && item.tasks?.length && sub == null) {
        const next = !itemIsDone(item);
        setItemStatus(state.store, state.selectedDay, index, next ? 1 : 0);
      } else if (sub != null) {
        const si = Number(sub);
        const cur = !!item.tasks?.[si]?.status;
        setItemStatus(state.store, state.selectedDay, index, cur ? 0 : 1, si);
      } else {
        const next = !itemIsDone(item);
        setItemStatus(state.store, state.selectedDay, index, next ? 1 : 0);
      }

      if (card) playPressAnim(card);
      refreshDoneUI();
      if (item.fromList || item.kind === "listref") {
        if (state.tab === "lists") renderLists();
      }
      persist();
      tg()?.HapticFeedback?.impactOccurred?.("light");
    }
  });

  $("#lists-root")?.addEventListener("click", (e) => {
    const descToggle = e.target.closest("[data-desc-toggle]");
    if (descToggle) {
      e.stopPropagation();
      const id = descToggle.dataset.descToggle;
      if (state.descOpen.has(id)) state.descOpen.delete(id);
      else state.descOpen.add(id);
      const block = $(`.task-desc[data-desc-for="${id}"]`);
      if (block) block.classList.toggle("open", state.descOpen.has(id));
      return;
    }

    const expand = e.target.closest("[data-expand]");
    if (expand) {
      const id = expand.dataset.expand;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      const card = e.target.closest(".task-card");
      if (card) card.classList.toggle("expanded", state.expanded.has(id));
      else renderLists();
      return;
    }

    const toggle = e.target.closest("[data-list-toggle]");
    if (!toggle) return;

    const listId = toggle.dataset.listToggle;
    const list = state.store.lists?.[String(listId)];
    if (!list) return;
    const card = e.target.closest(".task-card");
    const sub = toggle.dataset.listSub;

    if (toggle.dataset.parentToggle === "1" && sub == null) {
      const tasks = list.tasks || [];
      const done = !!list.status || (tasks.length > 0 && tasks.every((t) => t.status));
      setListStatus(listId, done ? 0 : 1);
    } else if (sub != null) {
      const si = Number(sub);
      const cur = !!list.tasks?.[si]?.status;
      setListStatus(listId, cur ? 0 : 1, si);
    }

    if (card) playPressAnim(card);
    renderLists();
    refreshDoneUI();
    persist();
    tg()?.HapticFeedback?.impactOccurred?.("light");
  });

  enableDragDrop($("#task-list"), { onReorder: handleReorder });

  $$("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });

  $("#btn-confirm-add").addEventListener("click", () => {
    addTask($("#add-task-input").value, $("#add-task-desc").value);
    closeModal("modal-add");
  });

  $("#add-task-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addTask($("#add-task-input").value, $("#add-task-desc").value);
      closeModal("modal-add");
    }
  });

  $("#btn-paste-code").addEventListener("click", () => {
    $("#code-textarea").value = getCodeText(state.store);
    openModal("modal-code");
  });

  $("#btn-save-code").addEventListener("click", async () => {
    const text = $("#code-textarea").value;
    applyTemplate(state.store, text);
    closeModal("modal-code");
    toggleEdit(false);
    renderTasks();
    if (state.tab === "lists") renderLists();
    await persist();
    tg()?.HapticFeedback?.notificationOccurred?.("success");
  });
}

async function boot() {
  initTelegram();
  renderDayMenu();
  bindEvents();

  try {
    state.store = await loadStore();
  } catch (err) {
    console.error(err);
    state.store = emptyStore();
    tg()?.showAlert?.(
      "Не удалось загрузить данные из KV. Проверьте binding PLANER_KV и передеплойте сайт."
    );
  }

  evaluateStreak(state.store, new Date());
  try {
    await saveStore(state.store);
  } catch (_) {}

  state.selectedDay = dayNameFromDate(new Date());
  renderDayMenu();
  renderTasks();
  renderStreak();
  syncTelegramChrome();
}

boot();
