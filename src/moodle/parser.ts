const QUESTION_SELECTORS = [".que", ".question", ".quiz-question"];

function cssEscape(value) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([^\w-])/g, "\\$1");
}

function extractText(element) {
  if (!element) {
    return "";
  }
  const text = element.innerText || element.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.bottom > 0 &&
    rect.top < viewportHeight &&
    rect.right > 0 &&
    rect.left < viewportWidth
  );
}

function visibleArea(element) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const visibleWidth =
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
  const visibleHeight =
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  if (visibleWidth <= 0 || visibleHeight <= 0) {
    return 0;
  }
  return visibleWidth * visibleHeight;
}

export function findCurrentQuestionElement() {
  const candidates = Array.from(
    document.querySelectorAll(QUESTION_SELECTORS.join(","))
  );
  const visible = candidates.filter(isElementVisible);
  if (!visible.length) {
    return null;
  }
  let best = visible[0];
  let bestScore = visibleArea(best);
  for (let i = 1; i < visible.length; i += 1) {
    const score = visibleArea(visible[i]);
    if (score > bestScore) {
      best = visible[i];
      bestScore = score;
    }
  }
  return best;
}

function getQuestionText(questionEl) {
  const textEl =
    questionEl.querySelector(".qtext") ||
    questionEl.querySelector(".questiontext") ||
    questionEl.querySelector(".formulation .qtext");
  if (textEl) {
    return extractText(textEl);
  }

  const clone = questionEl.cloneNode(true);
  clone.querySelectorAll(".answer").forEach((el) => el.remove());
  return extractText(clone);
}

export function extractAnswerItems(questionEl) {
  const inputs = Array.from(
    questionEl.querySelectorAll('input[type="radio"], input[type="checkbox"]')
  );

  const items = [];
  inputs.forEach((input) => {
    let label = null;
    if (input.id) {
      label = questionEl.querySelector(`label[for="${cssEscape(input.id)}"]`);
    }
    if (!label) {
      label = input.closest("label");
    }

    const container =
      (label &&
        label.closest(
          ".r0, .r1, .r2, .r3, .r4, .r5, .r6, .r7, .r8, .r9, .answer"
        )) ||
      input.closest(
        ".r0, .r1, .r2, .r3, .r4, .r5, .r6, .r7, .r8, .r9, .answer"
      ) ||
      label ||
      input.parentElement ||
      input;

    const target = label || container || input;
    const text = extractText(target);
    if (!text) {
      return;
    }

    items.push({
      text,
      element: target,
      container: container || target,
    });
  });

  if (!items.length) {
    const rowSelectors = Array.from({ length: 10 }, (_, i) => `.answer .r${i}`)
      .join(", ");
    const rows = Array.from(questionEl.querySelectorAll(rowSelectors));
    rows.forEach((row) => {
      const text = extractText(row);
      if (!text) {
        return;
      }
      items.push({
        text,
        element: row,
        container: row,
      });
    });
  }

  return items;
}

export function parseQuestion(questionEl) {
  const questionText = getQuestionText(questionEl);
  const answers = extractAnswerItems(questionEl).map((item) => item.text);
  return { questionText, answers };
}
