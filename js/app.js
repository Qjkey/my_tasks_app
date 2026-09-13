import {
  DAYS,
  DAY_SHORT,
  capitalize,
  dayNameFromDate,
  toDateKey,
  buildDayTasks,
} from "./parser.js";
import { loadStore, saveStore, applyTemplate } from "./storage.js";
import { evaluateStreak, weekStatus, pluralDays, applyMondayWeekReset } from "./streak.js";
import { enableDragDrop } from "./dragdrop.js";

const DELETE_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
</svg>`;

const CHEVRON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
  <polyline points="6 9 12 15 18 9"></polyline>
</svg>`;

const state = {
  store: null,
  selectedDay: dayNameFromDate(new Date()),
  viewDateKey: toDateKey(new Date()),
  editMode: false,
  expanded: new Set(),
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

  // MainButton не используем — «Добавить» в меню редактирования
  try {
    w.MainButton.hide();
  } catch (_) {}
}

function dateKeyForSelectedDay() {
  const today = new Date();
  const todayName = dayNameFromDate(today);
  if (state.selectedDay === todayName) return toDateKey(today);

  const jsToday = today.getDay();
  const todayIdx = jsToday === 0 ? 6 : jsToday - 1;
  const wantIdx = DAYS.indexOf(state.selectedDay);
  const delta = wantIdx - todayIdx;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
  return toDateKey(d);
}

function doneMap() {
  const key = dateKeyForSelectedDay();
  if (!state.store.completions[key]) state.store.completions[key] = {};
  return state.store.completions[key];
}

function isDone(id) {
  return !!doneMap()[id];
}

function setDone(id, value) {
  const map = doneMap();
  if (value) map[id] = true;
  else delete map[id];
}

function taskComplete(task) {
  if (task.subtasks?.length) {
    if (isDone(task.id)) return true;
    return task.subtasks.every((s) => isDone(s.id));
  }
  return isDone(task.id);
}

function renderDayMenu() {
  const menu = $("#day-menu");
  menu.innerHTML = DAYS.map(
    (d) =>
      `<button type="button" role="option" data-day="${d}" class="${d === state.selectedDay ? "selected" : ""}">${capitalize(d)}</button>`
  ).join("");
}

function trailingAction(task, hasSubs) {
  if (state.editMode) {
    return `<button type="button" class="delete-btn" data-delete="${task.id}" aria-label="Удалить">${DELETE_ICON}</button>`;
  }
  if (hasSubs) {
    return `<button type="button" class="expand-btn" data-expand="${task.id}" aria-label="Подзадачи">${CHEVRON_ICON}</button>`;
  }
  return `<span></span>`;
}

function renderTasks() {
  const list = $("#task-list");
  const dateKey = dateKeyForSelectedDay();
  const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);

  $("#current-day-label").textContent = capitalize(state.selectedDay);

  // в режиме редактирования все списки раскрыты
  if (state.editMode) {
    for (const task of tasks) {
      if (task.subtasks?.length) state.expanded.add(task.id);
    }
  }

  list.innerHTML = tasks
    .map((task) => {
      const hasSubs = task.subtasks?.length > 0;
      const expanded = state.editMode ? hasSubs : state.expanded.has(task.id);
      const done = taskComplete(task);

      const subs = hasSubs
        ? `<div class="subtasks"><div class="subtasks-inner">
            ${task.subtasks
              .map(
                (s) => `<div class="task-row sub" data-sub-id="${s.id}" data-parent="${task.id}">
                  <button type="button" class="check ${isDone(s.id) ? "done" : ""}" data-toggle="${s.id}" aria-label="Готово"></button>
                  <span class="task-title ${isDone(s.id) ? "done" : ""}">${escapeHtml(s.title)}</span>
                  ${
                    state.editMode
                      ? `<button type="button" class="delete-btn sub-delete" data-delete-sub="${s.id}" data-parent="${task.id}" aria-label="Удалить подзадачу">${DELETE_ICON}</button>`
                      : ""
                  }
                </div>`
              )
              .join("")}
          </div></div>`
        : "";

      return `<article class="task-card ${expanded ? "expanded" : ""}" data-id="${task.id}" data-kind="${task.kind}">
        <div class="task-row">
          <button type="button" class="check ${done ? "done" : ""}" data-toggle="${task.id}" data-parent-toggle="${hasSubs ? "1" : ""}" aria-label="Готово"></button>
          <span class="task-title ${done ? "done" : ""}">${escapeHtml(task.title)}</span>
          ${trailingAction(task, hasSubs)}
        </div>
        ${subs}
      </article>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  $("#tab-week").classList.toggle("active", tab === "week");
  $("#tab-streak").classList.toggle("active", tab === "streak");
  if (tab === "streak") renderStreak();
}

function toggleEdit(force) {
  state.editMode = typeof force === "boolean" ? force : !state.editMode;
  document.body.classList.toggle("edit-mode", state.editMode);
  $("#btn-edit").classList.toggle("active", state.editMode);
  $("#edit-toolbar").classList.toggle("hidden", !state.editMode);
  renderTasks();
}

/** Полный цикл анимации нажатия на карточке (не обрывается при отпускании) */
function playPressAnim(card) {
  if (!card || card.classList.contains("dragging")) return;
  card.classList.remove("press-anim");
  // restart animation
  void card.offsetWidth;
  card.classList.add("press-anim");
  const done = () => {
    card.classList.remove("press-anim");
    card.removeEventListener("animationend", done);
  };
  card.addEventListener("animationend", done);
}

/** Обновить галочки/зачёркивание без перерисовки всего списка */
function refreshDoneUI() {
  const dateKey = dateKeyForSelectedDay();
  const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);

  for (const task of tasks) {
    const card = $(`.task-card[data-id="${task.id}"]`);
    if (!card) continue;
    const done = taskComplete(task);
    const mainCheck = card.querySelector(".task-row:not(.sub) .check");
    const mainTitle = card.querySelector(".task-row:not(.sub) .task-title");
    mainCheck?.classList.toggle("done", done);
    mainTitle?.classList.toggle("done", done);

    for (const s of task.subtasks || []) {
      const row = card.querySelector(`.task-row.sub[data-sub-id="${s.id}"]`);
      if (!row) continue;
      const sd = isDone(s.id);
      row.querySelector(".check")?.classList.toggle("done", sd);
      row.querySelector(".task-title")?.classList.toggle("done", sd);
    }
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
  // обновляем огонёк сразу (даже если вкладка не открыта)
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
  openModal("modal-add");
  setTimeout(() => $("#add-task-input").focus(), 50);
}

function addTask(title) {
  title = title.trim();
  if (!title) return;
  const dateKey = dateKeyForSelectedDay();
  if (!state.store.extraTasks[dateKey]) state.store.extraTasks[dateKey] = [];

  const task = {
    id: `extra_${Math.random().toString(36).slice(2, 9)}`,
    title,
    kind: "once",
    subtasks: [],
  };
  state.store.extraTasks[dateKey].unshift(task);

  const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);
  state.store.order[dateKey] = tasks.map((t) => t.id);

  renderTasks();
  persist();
}

function deleteTask(taskId) {
  const dateKey = dateKeyForSelectedDay();
  const dayName = state.selectedDay;
  const tasks = buildDayTasks(state.store, dayName, dateKey);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;

  const map = doneMap();
  delete map[taskId];
  for (const s of task.subtasks || []) delete map[s.id];
  delete state.store.onceDone[taskId];

  removeTaskFromSources(taskId, dateKey, dayName);
  state.expanded.delete(taskId);

  const remaining = buildDayTasks(state.store, dayName, dateKey);
  state.store.order[dateKey] = remaining.map((t) => t.id);

  renderTasks();
  persist();
  tg()?.HapticFeedback?.impactOccurred?.("medium");
}

function deleteSubtask(parentId, subId) {
  const dateKey = dateKeyForSelectedDay();
  const dayName = state.selectedDay;

  const map = doneMap();
  delete map[subId];

  const extras = state.store.extraTasks[dateKey] || [];
  const ei = extras.findIndex((t) => t.id === parentId);
  if (ei >= 0) {
    extras[ei].subtasks = (extras[ei].subtasks || []).filter((s) => s.id !== subId);
  } else {
    const dayList = state.store.days[dayName] || [];
    const di = dayList.findIndex((t) => t.id === parentId);
    if (di >= 0) {
      dayList[di].subtasks = (dayList[di].subtasks || []).filter((s) => s.id !== subId);
    }
  }

  renderTasks();
  persist();
  tg()?.HapticFeedback?.impactOccurred?.("medium");
}

function handleReorder({ fromId, toId, mode }) {
  const dateKey = dateKeyForSelectedDay();
  const dayName = state.selectedDay;
  let tasks = buildDayTasks(state.store, dayName, dateKey);
  const fromIdx = tasks.findIndex((t) => t.id === fromId);
  const toIdx = tasks.findIndex((t) => t.id === toId);
  if (fromIdx < 0 || toIdx < 0) return;

  const [moved] = tasks.splice(fromIdx, 1);

  if (mode === "into") {
    const parent = tasks.find((t) => t.id === toId);
    if (!parent) return;
    if (!parent.subtasks) parent.subtasks = [];
    parent.subtasks.push({ id: moved.id, title: moved.title });
    for (const s of moved.subtasks || []) parent.subtasks.push(s);
    removeTaskFromSources(fromId, dateKey, dayName);
    syncParentSubtasks(parent, dateKey, dayName);
    state.store.order[dateKey] = tasks.map((t) => t.id);
  } else {
    let insertAt = tasks.findIndex((t) => t.id === toId);
    if (mode === "after") insertAt += 1;
    tasks.splice(insertAt, 0, moved);
    state.store.order[dateKey] = tasks.map((t) => t.id);
  }

  if (mode === "into") state.expanded.add(toId);

  renderTasks();
  persist();
}

function removeTaskFromSources(taskId, dateKey, dayName) {
  const extras = state.store.extraTasks[dateKey] || [];
  state.store.extraTasks[dateKey] = extras.filter((t) => t.id !== taskId);

  const dayList = state.store.days[dayName] || [];
  state.store.days[dayName] = dayList.filter((t) => t.id !== taskId);

  if (state.store.order[dateKey]) {
    state.store.order[dateKey] = state.store.order[dateKey].filter((id) => id !== taskId);
  }
}

function syncParentSubtasks(parent, dateKey, dayName) {
  const extras = state.store.extraTasks[dateKey] || [];
  const ei = extras.findIndex((t) => t.id === parent.id);
  if (ei >= 0) {
    extras[ei].subtasks = parent.subtasks;
    return;
  }
  const dayList = state.store.days[dayName] || [];
  const di = dayList.findIndex((t) => t.id === parent.id);
  if (di >= 0) dayList[di].subtasks = parent.subtasks;
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
  $("#btn-back-week").addEventListener("click", () => setTab("week"));

  $("#task-list").addEventListener("click", (e) => {
    const delSub = e.target.closest("[data-delete-sub]");
    if (delSub) {
      e.stopPropagation();
      deleteSubtask(delSub.dataset.parent, delSub.dataset.deleteSub);
      return;
    }

    const del = e.target.closest("[data-delete]");
    if (del) {
      e.stopPropagation();
      deleteTask(del.dataset.delete);
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

    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const id = toggle.dataset.toggle;
      const parentToggle = toggle.dataset.parentToggle === "1";
      const dateKey = dateKeyForSelectedDay();
      const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);
      const task = tasks.find((t) => t.id === id);

      if (parentToggle && task?.subtasks?.length) {
        const next = !taskComplete(task);
        for (const s of task.subtasks) setDone(s.id, next);
        setDone(task.id, next);
      } else {
        setDone(id, !isDone(id));
        const parentRow = toggle.closest("[data-parent]");
        if (parentRow) {
          const parentId = parentRow.dataset.parent;
          const parent = tasks.find((t) => t.id === parentId);
          if (parent) setDone(parent.id, taskComplete(parent));
        } else if (task?.subtasks?.length) {
          // клик по заголовку списка без parent-toggle — синхронизируем подзадачи
          const next = isDone(id);
          for (const s of task.subtasks) setDone(s.id, next);
        }
      }

      const root =
        tasks.find((t) => t.id === id) ||
        tasks.find((t) => t.subtasks?.some((s) => s.id === id));
      if (root?.kind === "once" && taskComplete(root)) {
        state.store.onceDone[root.id] = dateKey;
      }

      if (card) playPressAnim(card);
      refreshDoneUI();
      persist();
      tg()?.HapticFeedback?.impactOccurred?.("light");
    }
  });

  enableDragDrop($("#task-list"), { onReorder: handleReorder });

  $$("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });

  $("#btn-confirm-add").addEventListener("click", () => {
    addTask($("#add-task-input").value);
    closeModal("modal-add");
  });

  $("#add-task-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addTask($("#add-task-input").value);
      closeModal("modal-add");
    }
  });

  $("#btn-paste-code").addEventListener("click", () => {
    $("#code-textarea").value = state.store.template || "";
    openModal("modal-code");
  });

  $("#btn-save-code").addEventListener("click", async () => {
    const text = $("#code-textarea").value;
    applyTemplate(state.store, text);
    closeModal("modal-code");
    toggleEdit(false);
    renderTasks();
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
    state.store = (await import("./parser.js")).emptyStore();
    tg()?.showAlert?.(
      "Не удалось загрузить данные из KV. Проверьте binding PLANER_KV и передеплойте сайт."
    );
  }

  // Первый запуск в понедельник — сброс галочек прошлых дней
  applyMondayWeekReset(state.store, new Date());
  evaluateStreak(state.store, new Date());
  try {
    await saveStore(state.store);
  } catch (_) {}

  state.selectedDay = dayNameFromDate(new Date());
  renderDayMenu();
  renderTasks();
  renderStreak();
}

boot();
