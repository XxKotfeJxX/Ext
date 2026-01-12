import { getProxyUrl } from "./proxy";

function sendMessage(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background."));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || "Request failed."));
        return;
      }
      resolve(response.result);
    });
  });
}

export async function analyzeQuestion(input) {
  if (!getProxyUrl()) {
    throw new Error(
      "AI proxy URL is not configured. Set AI_PROXY_URL before building."
    );
  }
  return sendMessage("analyze", input);
}

export async function warmUp() {
  if (!getProxyUrl()) {
    return;
  }
  try {
    await sendMessage("warmUp");
  } catch (error) {
    // Warm-up is best-effort.
  }
}
