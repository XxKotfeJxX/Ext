const MARKER_CLASS = "ai-marker";
const HIGHLIGHT_CLASS = "ai-answer--suggested";

export function clearMarkers() {
  document.querySelectorAll(`.${MARKER_CLASS}`).forEach((el) => el.remove());
  document
    .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
    .forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
}

export function applyMarker(answerItems, choiceIndex) {
  clearMarkers();
  const target = answerItems[choiceIndex];
  if (!target || !target.element) {
    return;
  }

  const marker = document.createElement("span");
  marker.className = MARKER_CLASS;
  marker.textContent = "⭐ AI";

  const anchor = target.element;
  anchor.appendChild(marker);

  if (target.container) {
    target.container.classList.add(HIGHLIGHT_CLASS);
  }
}
