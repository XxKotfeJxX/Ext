const CACHE_PREFIX = "moodle-ai-cache:";

function cacheKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

export async function getCachedResult(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(cacheKey(key), (data) => {
      resolve(data[cacheKey(key)]);
    });
  });
}

export async function setCachedResult(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [cacheKey(key)]: value }, () => resolve());
  });
}
