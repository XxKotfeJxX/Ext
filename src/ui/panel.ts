function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (text) {
    el.textContent = text;
  }
  return el;
}

function formatChoiceLabel(index) {
  if (index >= 0 && index < 26) {
    return String.fromCharCode(65 + index);
  }
  return `#${index + 1}`;
}

let cachedControls = null;

export function createPanel() {
  if (cachedControls) {
    return cachedControls;
  }

  const panel = createEl("div", "ai-panel ai-panel--hidden");
  panel.id = "ai-panel";

  const header = createEl("div", "ai-panel__header", "AI Assistant");
  const body = createEl("div", "ai-panel__body");
  const footer = createEl("div", "ai-panel__footer", "Alt + A to toggle");

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  document.body.appendChild(panel);

  const controls = {
    element: panel,
    show() {
      panel.classList.remove("ai-panel--hidden");
    },
    hide() {
      panel.classList.add("ai-panel--hidden");
    },
    toggle() {
      panel.classList.toggle("ai-panel--hidden");
    },
    isVisible() {
      return !panel.classList.contains("ai-panel--hidden");
    },
    showMessage(message) {
      body.textContent = "";
      body.appendChild(
        createEl(
          "div",
          "ai-panel__disclaimer",
          "This is an AI suggestion, not guaranteed correct."
        )
      );
      body.appendChild(createEl("div", "ai-panel__message", message));
    },
    update(parsed, result) {
      body.textContent = "";

      body.appendChild(
        createEl(
          "div",
          "ai-panel__disclaimer",
          "This is an AI suggestion, not guaranteed correct."
        )
      );

      if (parsed.questionText) {
        const question = createEl("div", "ai-panel__question");
        question.textContent = parsed.questionText;
        body.appendChild(question);
      }

      const choiceLabel = formatChoiceLabel(result.choiceIndex);
      const choiceText =
        parsed.answers[result.choiceIndex] || "Unknown answer";
      const confidencePct = Math.round(result.confidence * 100);

      const suggested = createEl("div", "ai-panel__section");
      suggested.appendChild(
        createEl("div", "ai-panel__title", "Suggested Answer")
      );
      suggested.appendChild(
        createEl(
          "div",
          "ai-panel__value",
          `${choiceLabel}. ${choiceText} (${confidencePct}% confidence)`
        )
      );
      body.appendChild(suggested);

      const explanation = createEl("div", "ai-panel__section");
      explanation.appendChild(
        createEl("div", "ai-panel__title", "Why this is likely correct")
      );
      explanation.appendChild(
        createEl("div", "ai-panel__text", result.explanation || "")
      );
      body.appendChild(explanation);

      const wrongSection = createEl("div", "ai-panel__section");
      wrongSection.appendChild(
        createEl(
          "div",
          "ai-panel__title",
          "Why other answers are likely incorrect"
        )
      );
      const list = createEl("ul", "ai-panel__list");
      parsed.answers.forEach((answer, idx) => {
        if (idx === result.choiceIndex) {
          return;
        }
        const reason =
          result.wrongAnswers?.[idx] ||
          result.wrongAnswers?.[String(idx)] ||
          "No specific rationale provided.";
        const item = createEl("li", "ai-panel__list-item");
        const label = createEl(
          "strong",
          "ai-panel__list-label",
          `${formatChoiceLabel(idx)}. `
        );
        item.appendChild(label);
        item.appendChild(document.createTextNode(`${answer} — ${reason}`));
        list.appendChild(item);
      });
      wrongSection.appendChild(list);
      body.appendChild(wrongSection);
    },
  };

  cachedControls = controls;
  return cachedControls;
}
