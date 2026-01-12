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
  deepRequestId: 0,
  enabled: true,
  current: null,
  result: null,
};

function normalizeResult(raw) {
  if (!raw) {
    return null;
  }

  const explanation =
    typeof raw.explanation === "string" ? raw.explanation.trim() : "";
  const wrongAnswers =
    raw.wrongAnswers && typeof raw.wrongAnswers === "object"
      ? raw.wrongAnswers
      : {};

  return {
    choiceIndex: Number.isFinite(Number(raw.choiceIndex))
      ? Number(raw.choiceIndex)
      : 0,
    confidence: Number.isFinite(Number(raw.confidence))
      ? Number(raw.confidence)
      : 0,
    explanation,
    wrongAnswers,
  };
}

function isExplanationComplete(result) {
  if (!result) {
    return false;
  }
  const explanation = (result.explanation || "").trim();
  if (!explanation) {
    return false;
  }
  return explanation !== "No explanation was provided by the AI.";
}

function updatePanel(pendingExplanation) {
  if (!panel.isVisible() || !state.current || !state.result) {
    return;
  }
  panel.update(state.current.parsed, state.result, {
    pendingExplanation,
  });
}

function applyResult() {
  if (!state.enabled || !state.current || !state.result) {
    return;
  }

  const { questionEl, parsed, hash } = state.current;
  if (hash !== state.activeHash) {
    return;
  }

  const answerItems = extractAnswerItems(questionEl);
  applyMarker(answerItems, state.result.choiceIndex);

  if (panel.isVisible()) {
    if (isExplanationComplete(state.result)) {
      updatePanel(false);
    } else {
      ensureExplanation();
    }
  }
}

registerHotkey(() => {
  if (!state.enabled) {
    return;
  }
  panel.toggle();
  if (panel.isVisible()) {
    ensureExplanation();
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
  state.deepRequestId += 1;
  state.pendingHash = "";
}

function setEnabled(value) {
  state.enabled = value;
  if (!value) {
    clearPending();
    state.activeHash = "";
    state.current = null;
    state.result = null;
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

async function ensureExplanation() {
  if (!state.enabled || !state.current || !state.result) {
    return;
  }

  if (isExplanationComplete(state.result)) {
    updatePanel(false);
    return;
  }

  const { parsed, hash } = state.current;
  const requestId = (state.deepRequestId += 1);

  updatePanel(true);

  try {
    const deepResult = await analyzeQuestion({
      question: parsed.questionText,
      answers: parsed.answers,
      mode: "deep",
      choiceIndex: state.result.choiceIndex,
      confidence: state.result.confidence,
    });

    if (
      !state.enabled ||
      requestId !== state.deepRequestId ||
      state.activeHash !== hash
    ) {
      return;
    }

    state.result = normalizeResult({ ...state.result, ...deepResult });
    await setCachedResult(hash, state.result);
    applyResult();
  } catch (error) {
    if (
      !state.enabled ||
      requestId !== state.deepRequestId ||
      state.activeHash !== hash
    ) {
      return;
    }
    const message =
      error && error.message
        ? `Detailed analysis failed: ${error.message}`
        : "Detailed analysis failed.";
    panel.showMessage(message);
  }
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
  state.current = { questionEl, parsed, hash };

  const cached = normalizeResult(await getCachedResult(hash));
  if (cached) {
    state.result = cached;
    applyResult();
    if (panel.isVisible() && !isExplanationComplete(cached)) {
      ensureExplanation();
    }
    return;
  }

  if (state.pendingTimer) {
    clearTimeout(state.pendingTimer);
  }

  if (panel.isVisible()) {
    panel.showMessage("Analyzing the current question...");
  }

  state.requestId += 1;
  const requestId = state.requestId;

  state.pendingTimer = setTimeout(async () => {
    try {
      if (!state.enabled) {
        return;
      }
      const result = normalizeResult(
        await analyzeQuestion({
          question: parsed.questionText,
          answers: parsed.answers,
          mode: "fast",
        })
      );

      if (
        !state.enabled ||
        requestId !== state.requestId ||
        state.pendingHash !== hash
      ) {
        return;
      }

      state.result = result;
      await setCachedResult(hash, result);
      applyResult();
      if (panel.isVisible()) {
        ensureExplanation();
      }
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
