const DEFAULT_GEMINI_MODELS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.0-pro",
];

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedModelList = null;
let cachedModelListAt = 0;
const OPENAI_MODEL = "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return {
    statusCode: status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

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
    "- if unsure, still provide a best-effort short reason.",
    "",
    `Question: ${input.question}`,
    "Answers:",
    ...input.answers.map((answer, idx) => `${idx}. ${answer}`),
    "",
    `Chosen: ${fast.choiceIndex}`,
    `Confidence: ${fast.confidence}`,
  ].join("\n");
}

function parseJsonFromText(text) {
  if (!text) {
    return null;
  }

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  };

  const stripTrailingCommas = (value) =>
    value.replace(/,\s*([}\]])/g, "$1");

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");

  const direct = tryParse(cleaned) || tryParse(stripTrailingCommas(cleaned));
  if (direct) {
    return direct;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = cleaned.slice(start, end + 1);
    return tryParse(sliced) || tryParse(stripTrailingCommas(sliced));
  }

  return null;
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

function extractExplanation(parsed, rawText) {
  const candidates = [
    parsed?.explanation,
    parsed?.reasoning,
    parsed?.rationale,
    parsed?.analysis,
    parsed?.why,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate !== "string") {
      try {
        return JSON.stringify(candidate);
      } catch (error) {
        return String(candidate);
      }
    }
  }

  const raw = String(rawText || "").trim();
  if (raw) {
    const match = raw.match(/"explanation"\s*:\s*"([\s\S]*?)"\s*(,|})/);
    if (match) {
      return match[1].replace(/\\"/g, '"').trim();
    }
  }

  if (raw && !raw.startsWith("{")) {
    return raw;
  }

  return "";
}

function extractWrongAnswers(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return (
    parsed.wrongAnswers ||
    parsed.incorrect ||
    parsed.incorrectReasons ||
    parsed.others ||
    parsed.wrong
  );
}

function normalizeModelName(name) {
  return String(name || "")
    .trim()
    .replace(/^models\//, "");
}

async function listGeminiModels(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini listModels error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .filter((model) =>
      Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods.includes("generateContent")
        : false
    )
    .map((model) => normalizeModelName(model.name))
    .filter(Boolean);
}

async function getGeminiModels(apiKey) {
  const candidates = [];
  const custom = normalizeModelName(process.env.GEMINI_MODEL);
  if (custom) {
    candidates.push(custom);
  }

  const now = Date.now();
  if (cachedModelList && now - cachedModelListAt < MODEL_CACHE_TTL_MS) {
    cachedModelList.forEach((model) => {
      if (!candidates.includes(model)) {
        candidates.push(model);
      }
    });
    return candidates;
  }

  try {
    const list = await listGeminiModels(apiKey);
    if (list.length) {
      cachedModelList = list;
      cachedModelListAt = now;
      list.forEach((model) => {
        if (!candidates.includes(model)) {
          candidates.push(model);
        }
      });
      return candidates;
    }
  } catch (error) {
    // Ignore and fall back to defaults.
  }

  DEFAULT_GEMINI_MODELS.forEach((model) => {
    if (!candidates.includes(model)) {
      candidates.push(model);
    }
  });

  return candidates;
}

function isModelNotFound(error) {
  const message = String(error?.message || "");
  return (
    message.includes("NOT_FOUND") ||
    message.toLowerCase().includes("not found") ||
    message.toLowerCase().includes("not supported")
  );
}

async function callGemini(apiKey, model, prompt, maxOutputTokens) {
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

async function callGeminiWithFallback(apiKey, prompt, maxOutputTokens) {
  const models = await getGeminiModels(apiKey);
  let lastError = null;
  for (const model of models) {
    try {
      return await callGemini(apiKey, model, prompt, maxOutputTokens);
    } catch (error) {
      lastError = error;
      if (!isModelNotFound(error)) {
        break;
      }
    }
  }
  throw lastError || new Error("Gemini request failed.");
}

async function callOpenAI(apiKey, prompt) {
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function analyzeWithGemini(apiKey, input) {
  const fastText = await callGeminiWithFallback(
    apiKey,
    buildFastPrompt(input),
    200
  );
  const fastJson = parseJsonFromText(fastText) || {};

  const choiceIndex = sanitizeChoiceIndex(
    fastJson.choiceIndex,
    input.answers.length
  );
  const confidence = sanitizeConfidence(fastJson.confidence);

  const deepText = await callGeminiWithFallback(
    apiKey,
    buildDeepPrompt(input, { choiceIndex, confidence }),
    700
  );
  const deepJson = parseJsonFromText(deepText) || {};
  const explanation = extractExplanation(deepJson, deepText);

  return {
    choiceIndex,
    confidence,
    explanation:
      explanation || "No explanation was provided by the AI.",
    wrongAnswers: normalizeWrongAnswers(
      extractWrongAnswers(deepJson),
      choiceIndex,
      input.answers
    ),
  };
}

async function analyzeWithOpenAI(apiKey, input) {
  const fastText = await callOpenAI(apiKey, buildFastPrompt(input));
  const fastJson = parseJsonFromText(fastText) || {};

  const choiceIndex = sanitizeChoiceIndex(
    fastJson.choiceIndex,
    input.answers.length
  );
  const confidence = sanitizeConfidence(fastJson.confidence);

  const deepText = await callOpenAI(
    apiKey,
    buildDeepPrompt(input, { choiceIndex, confidence })
  );
  const deepJson = parseJsonFromText(deepText) || {};
  const explanation = extractExplanation(deepJson, deepText);

  return {
    choiceIndex,
    confidence,
    explanation:
      explanation || "No explanation was provided by the AI.",
    wrongAnswers: normalizeWrongAnswers(
      extractWrongAnswers(deepJson),
      choiceIndex,
      input.answers
    ),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method not allowed" };
  }

  let payload = null;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const question = String(payload?.question || "").trim();
  const answers = Array.isArray(payload?.answers)
    ? payload.answers.map((answer) => String(answer || "").trim())
    : [];

  if (!question || !answers.length) {
    return jsonResponse(
      { error: "Missing question text or answers." },
      400
    );
  }

  try {
    const provider = process.env.AI_PROVIDER || "gemini";
    const result =
      provider === "openai" && process.env.OPENAI_API_KEY
        ? await analyzeWithOpenAI(process.env.OPENAI_API_KEY, {
            question,
            answers,
          })
        : await analyzeWithGemini(process.env.GEMINI_API_KEY, {
            question,
            answers,
          });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse(
      { error: error?.message || "AI analysis failed." },
      500
    );
  }
};
