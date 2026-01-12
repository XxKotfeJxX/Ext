import {
  parseQuestion,
  extractAnswerItems,
  findCurrentQuestionElement,
} from "./moodle/parser";
import { observeQuestionChanges } from "./observer";
import { analyzeQuestion, warmUp } from "./ai/index";
import { getCachedResult, setCachedResult } from "./cache";
import { applyMarker, clearMarkers } from "./ui/marker";
import { createPanel } from "./ui/panel";
import { registerHotkey } from "./ui/hotkeys";
import { hashQuestion } from "./utils/hash";

const panel = createPanel();

const state = {
  activeHash: "",
  pendingHash: "",
  pendingTimer: null,
  requestId: 0,
  enabled: true,
};

registerHotkey(() => {
  if (state.enabled) {
    panel.toggle();
  }
});

function getEnabledSetting() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["aiEnabled"], (data) => {
      resolve(data.aiEnabled !== false);
    });
  });
}

function clearPending() {
  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
  }
  state.requestId += 1;
  state.pendingHash = "";
}

function setEnabled(value) {
  state.enabled = value;
  if (!value) {
    clearPending();
    state.activeHash = "";
    clearMarkers();
    panel.hide();
    return;
  }

  warmUp().catch(() => {
    // Warm-up is best-effort.
  });

  const current = findCurrentQuestionElement();
  if (current) {
    handleQuestion(current);
  }
}

function render(questionEl, parsed, result, hash) {
  if (!state.enabled || hash !== state.activeHash) {
    return;
  }
  const answerItems = extractAnswerItems(questionEl);
  applyMarker(answerItems, result.choiceIndex);
  panel.update(parsed, result);
}

async function handleQuestion(questionEl) {
  if (!state.enabled || !questionEl) {
    return;
  }

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
      if (!state.enabled) {
        return;
      }
      const result = await analyzeQuestion({
        question: parsed.questionText,
        answers: parsed.answers,
      });
      if (
        !state.enabled ||
        requestId !== state.requestId ||
        state.pendingHash !== hash
      ) {
        return;
      }
      await setCachedResult(hash, result);
      render(questionEl, parsed, result, hash);
    } catch (error) {
      if (
        !state.enabled ||
        requestId !== state.requestId ||
        state.pendingHash !== hash
      ) {
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    Object.prototype.hasOwnProperty.call(changes, "aiEnabled")
  ) {
    setEnabled(changes.aiEnabled.newValue !== false);
  }
});

getEnabledSetting().then((enabled) => setEnabled(enabled));

observeQuestionChanges((questionEl) => {
  handleQuestion(questionEl);
});
