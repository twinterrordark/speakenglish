// Cloudflare Worker: /api/chat isteğini Gemini'ye iletir, API anahtarını tarayıcıdan gizler.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

const SCENARIOS = {
  free: "Free conversation about the student's day, hobbies, and life.",
  restaurant: "Role-play at a restaurant: you are the waiter, the student is the customer ordering food.",
  interview: "Role-play a friendly job interview: you are the interviewer, the student is the candidate.",
  airport: "Role-play at an airport check-in desk: you are the airline staff, the student is the traveler.",
};
const LEVELS = ["A2", "B1", "B2"];

const MAX_MESSAGE = 400;
const MAX_HISTORY = 12;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    correction: { type: "string" },
    tip: { type: "string" },
  },
  required: ["reply", "correction", "tip"],
};

function systemPrompt(scenario, level) {
  return `You are Ms. Emma, a warm, encouraging English teacher. You are talking with a ${level} (CEFR) learner whose native language is Turkish.
Scenario: ${SCENARIOS[scenario]}

Rules:
- "reply": what you say out loud. Simple English suitable for ${level}. At most 2 short sentences (under 30 words). Usually end with a question to keep the conversation going.
- "correction": if the student's LAST message has grammar, vocabulary, or word-choice mistakes, write the corrected version of their whole sentence. Otherwise "". Ignore capitalization and punctuation; the text comes from speech recognition.
- "tip": if there is a correction, explain the mistake in Turkish in at most 12 words. Otherwise "".
- If the student writes in Turkish, reply in English, and put the English version of what they meant in "correction".
- Stay in character. No emojis, no markdown.`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function clip(text, max) {
  return String(text ?? "").trim().slice(0, max);
}

/**
 * Model uzun yazarsa yine de en fazla 2 cümle seslendirilsin.
 * Sohbet sorularla ilerlediği için kesilen kısımdaki ilk soru korunur.
 */
function limitSentences(text, max = 2) {
  const parts = (text.match(/[^.!?]+[.!?]*/g) ?? [text]).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= max) return parts.join(" ");
  const kept = parts.slice(0, max);
  if (!kept.some((p) => p.endsWith("?"))) {
    const question = parts.slice(max).find((p) => p.endsWith("?"));
    if (question) kept[max - 1] = question;
  }
  return kept.join(" ");
}

function parseBody(body) {
  const scenario = SCENARIOS[body?.scenario] ? body.scenario : "free";
  const level = LEVELS.includes(body?.level) ? body.level : "A2";
  const message = clip(body?.message, MAX_MESSAGE);
  const history = (Array.isArray(body?.history) ? body.history : [])
    .slice(-MAX_HISTORY)
    .filter((t) => t && (t.role === "user" || t.role === "model"))
    .map((t) => ({ role: t.role, text: clip(t.text, 600) }))
    .filter((t) => t.text);
  return { scenario, level, message, history };
}

async function chat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const { scenario, level, message, history } = parseBody(body);
  const apiKey = clip(request.headers.get("x-user-key"), 200) || env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "no_key" }, 503);

  const contents = history.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  contents.push({
    role: "user",
    parts: [{ text: message || "(The student just joined the lesson. Greet them briefly and ask your first question.)" }],
  });

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const generationConfig = {
    responseMimeType: "application/json",
    responseJsonSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 800,
    temperature: 0.8,
  };
  const thinkingLevel = env.GEMINI_THINKING_LEVEL ?? "minimal";
  if (thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel };

  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(scenario, level) }] },
      contents,
      generationConfig,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    console.error("Gemini error", res.status, detail);
    if (res.status === 429) return json({ error: "rate_limited" }, 429);
    if (res.status === 400 && /api key/i.test(detail)) return json({ error: "bad_key" }, 401);
    if (res.status === 403) return json({ error: "bad_key" }, 401);
    return json({ error: "upstream", status: res.status }, 502);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    out = { reply: text, correction: "", tip: "" };
  }
  const reply = limitSentences(clip(out.reply, 400));
  if (!reply) return json({ error: "empty" }, 502);
  return json({ reply, correction: clip(out.correction, 400), tip: clip(out.tip, 200) });
}

/** Sadece ALLOWED_ORIGINS listesindeki siteler (ör. GitHub Pages) tarayıcıdan çağırabilir. */
function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-user-key",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/chat") {
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    return chat(request, env);
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const res = await route(request, env);
    for (const [k, v] of Object.entries(corsHeaders(request, env))) res.headers.set(k, v);
    return res;
  },
};
