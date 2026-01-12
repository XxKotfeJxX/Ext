function isEditableTarget(target) {
  if (!target) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

export function registerHotkey(onToggle) {
  const handler = (event) => {
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === "KeyE"
    ) {
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      onToggle();
    }
  };

  window.addEventListener("keydown", handler, true);
  return () => window.removeEventListener("keydown", handler, true);
}
