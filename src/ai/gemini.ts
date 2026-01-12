const GEMINI_MODEL = "gemini-1.5-flash";

function buildFastPrompt(input) {
  return [
    "You are an assistant helping a student understand a Moodle quiz question.",
    "Pick the most likely correct answer.",
    "Return ONLY JSON with this shape:",
    '{ "choiceIndex": number, "confidence": number }',
    "Rules:",
    "- choiceIndex is 0-based.",
    "- confidence is between 0 and 1.",
    "",
    `Question: ${input.question}`,
    "Answers:",
    ...input.answers.map((answer, idx) => `${idx}. ${answer}`),
  ].join("\n");
}

function buildDeepPrompt(input, fast) {
  return [
    "You are an assistant helping a student understand a Moodle quiz question.",
    "Explain the suggested answer and why the other options are likely incorrect.",
    "Return ONLY JSON with this shape:",
    '{ "choiceIndex": number, "confidence": number, "explanation": string, "wrongAnswers": { "index": "reason" } }',
    "Rules:",
    "- choiceIndex is 0-based.",
    "- wrongAnswers must include every index except the chosen one.",
    "- keep explanations concise and practical.",
    "",
    `Question: ${input.question}`,
    "Answers:",
    ...input.answers.map((answer, idx) => `${idx}. ${answer}`),
    "",
    `Chosen: ${fast.choiceIndex}`,
    `Confidence: ${fast.confidence}`,
  ].join("\n");
}

function sanitizeConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, num));
}

function sanitizeChoiceIndex(value, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.max(0, Math.min(max - 1, Math.round(num)));
}

function parseJsonFromText(text) {
  if (!text) {
    return null;
  }

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
  }

  return null;
}

async function callGemini(apiKey, prompt, maxOutputTokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .join("");
  return text || "";
}

function normalizeWrongAnswers(raw, choiceIndex, answers) {
  const normalized = {};
  for (let i = 0; i < answers.length; i += 1) {
    if (i === choiceIndex) {
      continue;
    }
    const reason =
      (raw && (raw[i] || raw[String(i)])) ||
      "No specific rationale provided.";
    normalized[i] = reason;
  }
  return normalized;
}

export async function analyzeWithGemini(apiKey, input) {
  if (!input.answers.length) {
    return {
      choiceIndex: 0,
      confidence: 0,
      explanation: "No answer options were detected for this question.",
      wrongAnswers: {},
    };
  }

  const fastText = await callGemini(apiKey, buildFastPrompt(input), 200);
  const fastJson = parseJsonFromText(fastText) || {};

  const choiceIndex = sanitizeChoiceIndex(
    fastJson.choiceIndex,
    input.answers.length
  );
  const confidence = sanitizeConfidence(fastJson.confidence);

  const deepText = await callGemini(
    apiKey,
    buildDeepPrompt(input, { choiceIndex, confidence }),
    700
  );
  const deepJson = parseJsonFromText(deepText) || {};

  return {
    choiceIndex,
    confidence,
    explanation:
      deepJson.explanation || "No explanation was provided by the AI.",
    wrongAnswers: normalizeWrongAnswers(
      deepJson.wrongAnswers,
      choiceIndex,
      input.answers
    ),
  };
}

let didWarmUp = false;

export async function warmUpGemini(apiKey) {
  if (didWarmUp) {
    return;
  }
  didWarmUp = true;
  try {
    await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
  } catch (error) {
    // Ignore warm-up failures; the main request will surface errors.
  }
}
