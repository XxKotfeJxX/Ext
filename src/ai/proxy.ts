const RAW_PROXY_URL = "__AI_PROXY_URL__";

function normalizeProxyUrl(value) {
  if (!value || value === "__AI_PROXY_URL__") {
    return "";
  }
  return value.replace(/\/+$/, "");
}

const PROXY_URL = normalizeProxyUrl(RAW_PROXY_URL);

export function getProxyUrl() {
  return PROXY_URL;
}

export async function analyzeWithProxy(input) {
  if (!PROXY_URL) {
    throw new Error(
      "AI proxy URL is not configured. Set AI_PROXY_URL before building."
    );
  }

  const response = await fetch(`${PROXY_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Proxy error ${response.status}: ${text}`);
  }

  return response.json();
}

export async function warmUpProxy() {
  if (!PROXY_URL) {
    return;
  }

  try {
    await fetch(`${PROXY_URL}/health`, { method: "GET" });
  } catch (error) {
    // Ignore warm-up failures.
  }
}
