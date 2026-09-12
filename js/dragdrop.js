/**
 * Drag-and-drop в режиме редактирования.
 * - Перестановка задач в списке
 * - Drop внутрь раскрытых подзадач → задача становится подзадачей
 *   и наследует kind родителя (статус списка).
 */

export function enableDragDrop(listEl, { onReorder }) {
  let dragId = null;
  let dragEl = null;
  let pointerId = null;
  let startY = 0;

  function clearHints() {
    listEl.querySelectorAll(".drop-before, .drop-after, .drop-target").forEach((el) => {
      el.classList.remove("drop-before", "drop-after", "drop-target");
      delete el._dropMode;
    });
  }

  function cardFromPoint(x, y) {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      const card = el.closest?.(".task-card");
      if (card && card !== dragEl && listEl.contains(card)) return card;
    }
    return null;
  }

  function onPointerDown(e) {
    if (!document.body.classList.contains("edit-mode")) return;
    if (e.target.closest(".task-row.sub")) return;

    const card = e.target.closest(".task-card");
    if (!card || !listEl.contains(card)) return;

    dragId = card.dataset.id;
    dragEl = card;
    pointerId = e.pointerId;
    startY = e.clientY;
    try {
      card.setPointerCapture(pointerId);
    } catch (_) {}
    card.classList.add("dragging");
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragEl || e.pointerId !== pointerId) return;
    const offsetY = e.clientY - startY;
    dragEl.style.transform = `translateY(${offsetY}px) scale(1.02)`;

    clearHints();
    const under = cardFromPoint(e.clientX, e.clientY);
    if (!under) return;

    const rect = under.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    const expanded = under.classList.contains("expanded");
    // середина карточки (особенно раскрытой) → стать подзадачей
    const intoZone = expanded ? rel > 0.22 && rel < 0.95 : rel > 0.35 && rel < 0.65;

    if (intoZone) {
      under.classList.add("drop-target");
      under._dropMode = "into";
    } else if (rel < 0.5) {
      under.classList.add("drop-before");
      under._dropMode = "before";
    } else {
      under.classList.add("drop-after");
      under._dropMode = "after";
    }
  }

  function onPointerUp(e) {
    if (!dragEl || e.pointerId !== pointerId) return;

    const under = listEl.querySelector(".drop-before, .drop-after, .drop-target");
    const fromId = dragId;
    let payload = null;

    if (under && under.dataset.id !== fromId) {
      payload = {
        fromId,
        toId: under.dataset.id,
        mode: under._dropMode || "after",
      };
    }

    dragEl.classList.remove("dragging");
    dragEl.style.transform = "";
    clearHints();
    dragEl = null;
    dragId = null;
    pointerId = null;

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
