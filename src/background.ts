import { analyzeWithProxy, getProxyUrl, warmUpProxy } from "./ai/proxy";

function sendError(sendResponse, error) {
  const message = error && error.message ? error.message : "Request failed.";
  sendResponse({ ok: false, error: message });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (!getProxyUrl()) {
    sendResponse({
      ok: false,
      error: "AI proxy URL is not configured. Set AI_PROXY_URL before building.",
    });
    return;
  }

  if (message.type === "warmUp") {
    warmUpProxy()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendError(sendResponse, error));
    return true;
  }

  if (message.type === "analyze") {
    analyzeWithProxy(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendError(sendResponse, error));
    return true;
  }
});
