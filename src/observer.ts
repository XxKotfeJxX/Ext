import { findCurrentQuestionElement } from "./moodle/parser";

function debounce(fn, delay) {
  let timer = null;
  return () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delay);
  };
}

export function observeQuestionChanges(onQuestion) {
  let lastElement = null;
  let lastNotify = 0;

  const check = () => {
    const current = findCurrentQuestionElement();
    if (!current) {
      return;
    }
    const now = Date.now();
    if (current !== lastElement || now - lastNotify > 500) {
      lastElement = current;
      lastNotify = now;
      onQuestion(current);
    }
  };

  const debouncedCheck = debounce(check, 200);
  const observer = new MutationObserver(debouncedCheck);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  window.addEventListener("scroll", debouncedCheck, { passive: true });
  window.addEventListener("resize", debouncedCheck);
  window.addEventListener("hashchange", debouncedCheck);
  window.addEventListener("popstate", debouncedCheck);

  check();

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", debouncedCheck);
    window.removeEventListener("resize", debouncedCheck);
    window.removeEventListener("hashchange", debouncedCheck);
    window.removeEventListener("popstate", debouncedCheck);
  };
}
