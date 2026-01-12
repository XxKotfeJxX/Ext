import { parseQuestion, extractAnswerItems } from "./moodle/parser";
import { observeQuestionChanges } from "./observer";
import { analyzeQuestion, warmUp } from "./ai/index";
import { getCachedResult, setCachedResult } from "./cache";
import { applyMarker } from "./ui/marker";
import { createPanel } from "./ui/panel";
import { registerHotkey } from "./ui/hotkeys";
import { hashQuestion } from "./utils/hash";

const panel = createPanel();
registerHotkey(() => panel.toggle());

const state = {
  activeHash: "",
  pendingHash: "",
  pendingTimer: null,
  requestId: 0,
};

function render(questionEl, parsed, result, hash) {
  if (hash !== state.activeHash) {
    return;
  }
  const answerItems = extractAnswerItems(questionEl);
  applyMarker(answerItems, result.choiceIndex);
  panel.update(parsed, result);
}

async function handleQuestion(questionEl) {
  const parsed = parseQuestion(questionEl);
  if (!parsed.questionText || !parsed.answers.length) {
    return;
  }

  const hash = await hashQuestion(parsed.questionText, parsed.answers);
  const hasMarker = Boolean(questionEl.querySelector(".ai-marker"));
  if (hash === state.activeHash && hasMarker) {
    return;
  }

  state.activeHash = hash;
  state.pendingHash = hash;

  const cached = await getCachedResult(hash);
  if (cached) {
    render(questionEl, parsed, cached, hash);
    return;
  }

  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
  }

  panel.showMessage("Analyzing the current question...");
  state.requestId += 1;
  const requestId = state.requestId;

  state.pendingTimer = setTimeout(async () => {
    try {
      const result = await analyzeQuestion({
        question: parsed.questionText,
        answers: parsed.answers,
      });
      if (requestId !== state.requestId || state.pendingHash !== hash) {
        return;
      }
      await setCachedResult(hash, result);
      render(questionEl, parsed, result, hash);
    } catch (error) {
      if (requestId !== state.requestId || state.pendingHash !== hash) {
        return;
      }
      const message =
        error && error.message
          ? `AI analysis failed: ${error.message}`
          : "AI analysis failed.";
      panel.showMessage(message);
    }
  }, 300);
}

warmUp().catch(() => {
  // Warm-up is best-effort.
});

observeQuestionChanges((questionEl) => {
  handleQuestion(questionEl);
});
