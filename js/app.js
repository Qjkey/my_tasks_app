import {
  DAYS,
  DAY_SHORT,
  capitalize,
  dayNameFromDate,
  toDateKey,
  buildDayTasks,
} from "./parser.js";
import { loadStore, saveStore, applyTemplate } from "./storage.js";
import { evaluateStreak, weekStatus, pluralDays } from "./streak.js";
import { enableDragDrop } from "./dragdrop.js";

const MONTHS_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const state = {
  store: null,
  selectedDay: dayNameFromDate(new Date()),
  viewDateKey: toDateKey(new Date()), // для completions привязка к «сегодня» если выбран текущий weekday
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
  try {
    w.setHeaderColor("#1a1d21");
    w.setBackgroundColor("#1a1d21");
  } catch (_) {}

  // Кнопка «Добавить»
  w.MainButton.setText("Добавить");
  w.MainButton.show();
  w.MainButton.onClick(() => openAddModal());

  if (w.themeParams?.bg_color) {
    // оставляем наш тёмный дизайн
  }
}

/** Если выбран день недели = сегодня → пишем completions на сегодняшнюю дату.
 *  Иначе — на ближайшую/текущую дату этого weekday в этой неделе (для демо).
 */
function dateKeyForSelectedDay() {
  const today = new Date();
  const todayName = dayNameFromDate(today);
  if (state.selectedDay === todayName) return toDateKey(today);

  // дата выбранного дня в текущей неделе (пн–вс)
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
  if (task.subtasks?.length) return task.subtasks.every((s) => isDone(s.id));
  return isDone(task.id);
}

function renderDayMenu() {
  const menu = $("#day-menu");
  menu.innerHTML = DAYS.map(
    (d) =>
      `<button type="button" role="option" data-day="${d}" class="${d === state.selectedDay ? "selected" : ""}">${capitalize(d)}</button>`
  ).join("");
}

function renderTasks() {
  const list = $("#task-list");
  const dateKey = dateKeyForSelectedDay();
  const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);

  $("#current-day-label").textContent = capitalize(state.selectedDay);

  list.innerHTML = tasks
    .map((task) => {
      const hasSubs = task.subtasks?.length > 0;
      const expanded = state.expanded.has(task.id);
      const done = taskComplete(task);
      const chevron = hasSubs
        ? `<button type="button" class="expand-btn" data-expand="${task.id}" aria-label="Подзадачи">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>`
        : `<span></span>`;

      const subs = hasSubs
        ? `<div class="subtasks"><div class="subtasks-inner">
            ${task.subtasks
              .map(
                (s) => `<div class="task-row sub" data-sub-id="${s.id}" data-parent="${task.id}">
                  <button type="button" class="check ${isDone(s.id) ? "done" : ""}" data-toggle="${s.id}" aria-label="Готово"></button>
                  <span class="task-title ${isDone(s.id) ? "done" : ""}">${escapeHtml(s.title)}</span>
                </div>`
              )
              .join("")}
          </div></div>`
        : "";

      return `<article class="task-card ${expanded ? "expanded" : ""}" data-id="${task.id}" data-kind="${task.kind}">
        <div class="task-row">
          <button type="button" class="check ${done ? "done" : ""}" data-toggle="${task.id}" data-parent-toggle="${hasSubs ? "1" : ""}" aria-label="Готово"></button>
          <span class="task-title ${done ? "done" : ""}">${escapeHtml(task.title)}</span>
          ${chevron}
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
  $("#streak-count").textContent = pluralDays(streak.count || 0);

  const head = $("#week-calendar-head");
  head.innerHTML = DAY_SHORT.map((d) => `<span>${d}</span>`).join("");

  const row = $("#week-calendar-row");
  const days = weekStatus(state.store, new Date());
  row.innerHTML = days
    .map((d) => {
      const cls = [
        "day-dot",
        d.status === "done" ? "done" : "",
        d.status === "missed" ? "missed" : "",
        d.status === "today" ? "today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="${cls}" title="${d.key}"></div>`;
    })
    .join("");
}

function renderNavDate() {
  const now = new Date();
  $("#nav-cal-month").textContent = MONTHS_EN[now.getMonth()];
  $("#nav-cal-day").textContent = String(now.getDate());
}

function setTab(tab) {
  state.tab = tab;
  $("#tab-week").classList.toggle("active", tab === "week");
  $("#tab-streak").classList.toggle("active", tab === "streak");
  $("#nav-week").classList.toggle("active", tab === "week");
  $("#nav-streak").classList.toggle("active", tab === "streak");

  const w = tg();
  if (w?.MainButton) {
    if (tab === "week") w.MainButton.show();
    else w.MainButton.hide();
  }

  if (tab === "streak") renderStreak();
}

function toggleEdit(force) {
  state.editMode = typeof force === "boolean" ? force : !state.editMode;
  document.body.classList.toggle("edit-mode", state.editMode);
  $("#btn-edit").classList.toggle("active", state.editMode);
  $("#edit-toolbar").classList.toggle("hidden", !state.editMode);
  const w = tg();
  if (w?.MainButton) {
    if (state.editMode) w.MainButton.hide();
    else if (state.tab === "week") w.MainButton.show();
  }
}

async function persist() {
  evaluateStreak(state.store, new Date());
  await saveStore(state.store);
  if (state.tab === "streak") renderStreak();
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

  // Если доступен native prompt — можно как fallback, но UI-модалка надёжнее в TMA
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

  // обновить order: новый id в начало
  const tasks = buildDayTasks(state.store, state.selectedDay, dateKey);
  state.store.order[dateKey] = tasks.map((t) => t.id);

  renderTasks();
  persist();
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
    // подзадача наследует «статус списка» родителя через принадлежность к нему
    parent.subtasks.push({ id: moved.id, title: moved.title });
    for (const s of moved.subtasks || []) parent.subtasks.push(s);
    removeTaskFromSources(fromId, dateKey, dayName);
    syncParentSubtasks(parent, dateKey, dayName);
    // порядок корня без moved
    state.store.order[dateKey] = tasks.map((t) => t.id);
  } else {
    let insertAt = tasks.findIndex((t) => t.id === toId);
    if (mode === "after") insertAt += 1;
    tasks.splice(insertAt, 0, moved);
    state.store.order[dateKey] = tasks.map((t) => t.id);
  }

  // авто-раскрыть родителя при drop into
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
  // обновить в days или extra
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
  $("#btn-to-streak").addEventListener("click", () => setTab("streak"));

  $("#nav-week").addEventListener("click", () => setTab("week"));
  $("#nav-streak").addEventListener("click", () => setTab("streak"));

  $("#task-list").addEventListener("click", (e) => {
    if (state.editMode) return;

    const expand = e.target.closest("[data-expand]");
    if (expand) {
      const id = expand.dataset.expand;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderTasks();
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
        // синхронизация родителя
        const parentRow = toggle.closest("[data-parent]");
        if (parentRow) {
          const parentId = parentRow.dataset.parent;
          const parent = tasks.find((t) => t.id === parentId);
          if (parent) setDone(parent.id, taskComplete(parent));
        }
      }

      // once: если выполнена целиком — пометить onceDone (исчезнет в следующие недели? 
      // по ТЗ «один раз» — после выполнения в этот день больше не нужна в будущем)
      const root = tasks.find((t) => t.id === id) || tasks.find((t) => t.subtasks?.some((s) => s.id === id));
      if (root?.kind === "once" && taskComplete(root)) {
        state.store.onceDone[root.id] = dateKey;
      }

      renderTasks();
      persist();
      tg()?.HapticFeedback?.impactOccurred?.("light");
    }
  });

  enableDragDrop($("#task-list"), { onReorder: handleReorder });

  // Modals
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
  renderNavDate();
  renderDayMenu();
  bindEvents();

  state.store = await loadStore();
  evaluateStreak(state.store, new Date());
  await saveStore(state.store);

  state.selectedDay = dayNameFromDate(new Date());
  renderDayMenu();
  renderTasks();
  renderStreak();
}

boot();
