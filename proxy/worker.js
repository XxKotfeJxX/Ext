const DEFAULT_GEMINI_MODELS = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.0-pro",
];
const OPENAI_MODEL = "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

function getGeminiModels(env) {
  const custom = env?.GEMINI_MODEL;
  if (custom && custom.trim()) {
    return [custom.trim()];
  }
  return DEFAULT_GEMINI_MODELS;
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

async function callGeminiWithFallback(env, apiKey, prompt, maxOutputTokens) {
  const models = getGeminiModels(env);
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

async function analyzeWithGemini(env, apiKey, input) {
  const fastText = await callGeminiWithFallback(
    env,
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
    env,
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (url.pathname !== "/analyze") {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    let payload = null;
    try {
      payload = await request.json();
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
      const provider = env.AI_PROVIDER || "gemini";
      const result =
        provider === "openai" && env.OPENAI_API_KEY
          ? await analyzeWithOpenAI(env.OPENAI_API_KEY, { question, answers })
          : await analyzeWithGemini(env, env.GEMINI_API_KEY, {
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
  },
};
