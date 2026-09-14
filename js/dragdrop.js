/**
 * Drag-and-drop (мышь + тач).
 * В edit-mode: touch-action:none, захват на document, мягкий hit-test.
 */

export function enableDragDrop(listEl, { onReorder }) {
  let dragId = null;
  let dragEl = null;
  let pointerId = null;
  let startY = 0;
  let startX = 0;
  let active = false;
  let lastTarget = null;
  let lastMode = null;
  let lastY = 0;
  let lastX = 0;

  function clearHints() {
    listEl.querySelectorAll(".drop-before, .drop-after, .drop-target").forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "drop-target");
      delete el._dropMode;
    });
  }

  function cards() {
    return [...listEl.querySelectorAll(".task-card")].filter((c) => c !== dragEl);
  }

  function nearestCard(x, y) {
    const list = cards();
    if (!list.length) return null;

    let best = null;
    let bestDist = Infinity;

    for (const card of list) {
      const r = card.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      const top = r.top - 16;
      const bottom = r.bottom + 16;
      let dist;
      if (y >= top && y <= bottom) {
        dist = Math.abs(y - mid) * 0.2;
      } else if (y < top) {
        dist = top - y;
      } else {
        dist = y - bottom;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    }
    return best;
  }

  function resolveMode(card, y) {
    const rect = card.getBoundingClientRect();
    const rel = (y - rect.top) / Math.max(rect.height, 1);
    const expanded = card.classList.contains("expanded");
    if (expanded && rel > 0.35 && rel < 0.8) return "into";
    if (rel < 0.5) return "before";
    return "after";
  }

  function applyHint(card, mode) {
    clearHints();
    if (!card || !mode) return;
    if (mode === "into") card.classList.add("drop-target");
    else if (mode === "before") card.classList.add("drop-before");
    else card.classList.add("drop-after");
    card._dropMode = mode;
    lastTarget = card;
    lastMode = mode;
  }

  function finish(commit) {
    if (!dragEl) return;

    let payload = null;
    if (commit && active) {
      let target = lastTarget;
      let mode = lastMode;
      if (!target) {
        target = nearestCard(lastX, lastY);
        if (target) mode = resolveMode(target, lastY);
      }
      if (target && target.dataset.id !== dragId && mode) {
        payload = { fromId: dragId, toId: target.dataset.id, mode };
      }
    }

    dragEl.classList.remove("dragging");
    dragEl.style.transform = "";
    dragEl.style.zIndex = "";
    clearHints();

    try {
      if (pointerId != null) dragEl.releasePointerCapture(pointerId);
    } catch (_) {}

    dragEl = null;
    dragId = null;
    pointerId = null;
    active = false;
    lastTarget = null;
    lastMode = null;

    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);

    if (payload) onReorder(payload);
  }

  function onPointerDown(e) {
    if (!document.body.classList.contains("edit-mode")) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest(".task-row.sub")) return;
    if (e.target.closest("[data-delete], .delete-btn, [data-delete-sub], .info-btn, .check")) {
      return;
    }

    const card = e.target.closest(".task-card");
    if (!card || !listEl.contains(card)) return;

    dragId = card.dataset.id;
    dragEl = card;
    pointerId = e.pointerId;
    startY = e.clientY;
    startX = e.clientX;
    lastX = e.clientX;
    lastY = e.clientY;
    active = false;
    lastTarget = null;
    lastMode = null;

    try {
      card.setPointerCapture(pointerId);
    } catch (_) {}

    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);

    // на таче блокируем скролл сразу в edit-mode
    if (e.pointerType === "touch") {
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    if (!dragEl || e.pointerId !== pointerId) return;

    lastX = e.clientX;
    lastY = e.clientY;
    const dy = e.clientY - startY;
    const dx = e.clientX - startX;
    const isTouch = e.pointerType === "touch";
    const threshold = isTouch ? 8 : 3;

    if (!active) {
      if (Math.hypot(dx, dy) < threshold) return;
      active = true;
      dragEl.classList.add("dragging");
      dragEl.style.zIndex = "60";
    }

    e.preventDefault();
    dragEl.style.transform = `translateY(${dy}px) scale(1.03)`;

    const under = nearestCard(e.clientX, e.clientY);
    if (!under) {
      clearHints();
      lastTarget = null;
      lastMode = null;
      return;
    }
    applyHint(under, resolveMode(under, e.clientY));
  }

  function onPointerUp(e) {
    if (!dragEl || e.pointerId !== pointerId) return;
    finish(true);
  }

  function onPointerCancel(e) {
    if (!dragEl || e.pointerId !== pointerId) return;
    // тач часто шлёт cancel — всё равно пытаемся поставить по lastY
    finish(true);
  }

  listEl.addEventListener("pointerdown", onPointerDown, { passive: false });

  return () => {
    listEl.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);
  };
}
