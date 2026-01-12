import { analyzeWithProxy, getProxyUrl, warmUpProxy } from "./proxy";

export async function analyzeQuestion(input) {
  if (!getProxyUrl()) {
    throw new Error(
      "AI proxy URL is not configured. Set AI_PROXY_URL before building."
    );
  }
  return analyzeWithProxy(input);
}

export async function warmUp() {
  await warmUpProxy();
}
