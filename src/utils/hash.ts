const encoder = new TextEncoder();

function fallbackHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `f${(hash >>> 0).toString(16)}`;
}

export async function hashString(input) {
  if (!crypto?.subtle) {
    return fallbackHash(input);
  }

  const buffer = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashQuestion(questionText, answers) {
  const input = `${questionText}\n${answers.join("|")}`;
  return hashString(input);
}
