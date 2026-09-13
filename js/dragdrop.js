/**
 * Drag-and-drop в режиме редактирования.
 * Упрощённый hit-test: ближайшая карточка по Y, широкие зоны before/after.
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

  function clearHints() {
    listEl.querySelectorAll(".drop-before, .drop-after, .drop-target").forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "drop-target");
      delete el._dropMode;
    });
  }

  function cards() {
    return [...listEl.querySelectorAll(".task-card")].filter((c) => c !== dragEl);
  }

  /** Ближайшая карточка к точке (с запасом по вертикали между элементами) */
  function nearestCard(x, y) {
    const list = cards();
    if (!list.length) return null;

    let best = null;
    let bestDist = Infinity;

    for (const card of list) {
      const r = card.getBoundingClientRect();
      // расширяем hitbox вверх/вниз на половину gap
      const top = r.top - 8;
      const bottom = r.bottom + 8;
      let dist;
      if (y >= top && y <= bottom) {
        dist = Math.abs(y - (r.top + r.height / 2)) * 0.25;
      } else if (y < top) {
        dist = top - y;
      } else {
        dist = y - bottom;
      }
      // лёгкий штраф по X, если далеко в сторону
      dist += Math.max(0, Math.abs(x - (r.left + r.width / 2)) - r.width) * 0.15;

      if (dist < bestDist) {
        bestDist = dist;
        best = card;
      }
    }

    // не цепляем слишком далёкие
    if (bestDist > 120) return null;
    return best;
  }

  function resolveMode(card, y) {
    const rect = card.getBoundingClientRect();
    const rel = (y - rect.top) / Math.max(rect.height, 1);
    const expanded = card.classList.contains("expanded");

    // into только у раскрытых и только узкая средняя зона
    if (expanded && rel > 0.4 && rel < 0.75) {
      return "into";
    }
    // широкие зоны перестановки
    if (rel < 0.55) return "before";
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

  function onPointerDown(e) {
    if (!document.body.classList.contains("edit-mode")) return;
    if (e.target.closest(".task-row.sub")) return;
    if (e.target.closest("[data-delete], .delete-btn")) return;

    const card = e.target.closest(".task-card");
    if (!card || !listEl.contains(card)) return;

    dragId = card.dataset.id;
    dragEl = card;
    pointerId = e.pointerId;
    startY = e.clientY;
    startX = e.clientX;
    active = false;
    lastTarget = null;
    lastMode = null;

    try {
      card.setPointerCapture(pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (!dragEl || e.pointerId !== pointerId) return;

    const dy = e.clientY - startY;
    const dx = e.clientX - startX;

    // старт после небольшого сдвига — проще «подхватить»
    if (!active) {
      if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
      active = true;
      dragEl.classList.add("dragging");
    }

    dragEl.style.transform = `translateY(${dy}px) scale(1.02)`;

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

    let payload = null;

    if (active) {
      let target = lastTarget;
      let mode = lastMode;

      // если отпустили «мимо» — всё равно берём ближайшую
      if (!target) {
        target = nearestCard(e.clientX, e.clientY);
        if (target) mode = resolveMode(target, e.clientY);
      }

      if (target && target.dataset.id !== dragId && mode) {
        payload = { fromId: dragId, toId: target.dataset.id, mode };
      }
    }

    dragEl.classList.remove("dragging");
    dragEl.style.transform = "";
    clearHints();
    dragEl = null;
    dragId = null;
    pointerId = null;
    active = false;
    lastTarget = null;
    lastMode = null;

    if (payload) onReorder(payload);
  }

  listEl.addEventListener("pointerdown", onPointerDown);
  listEl.addEventListener("pointermove", onPointerMove);
  listEl.addEventListener("pointerup", onPointerUp);
  listEl.addEventListener("pointercancel", onPointerUp);

  return () => {
    listEl.removeEventListener("pointerdown", onPointerDown);
    listEl.removeEventListener("pointermove", onPointerMove);
    listEl.removeEventListener("pointerup", onPointerUp);
    listEl.removeEventListener("pointercancel", onPointerUp);
  };
}
