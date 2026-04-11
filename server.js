import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ======================
// ENV
// ======================
const GROQ_KEY = process.env.GROQ_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const REDIS_URL = process.env.REDIS_URL;

// ======================
// SIMPLE CACHE (Redis optional)
// ======================
let memoryCache = {};

async function getCache(key) {
  if (REDIS_URL) {
    try {
      const res = await fetch(`${REDIS_URL}/get/${key}`);
      const data = await res.json();
      return data?.value ? JSON.parse(data.value) : null;
    } catch {
      return memoryCache[key];
    }
  }
  return memoryCache[key];
}

async function setCache(key, value) {
  if (REDIS_URL) {
    try {
      await fetch(`${REDIS_URL}/set/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(value) })
      });
    } catch {
      memoryCache[key] = value;
    }
  } else {
    memoryCache[key] = value;
  }
}

// ======================
// PROMPT (结构化JSON)
// ======================
function buildPrompt(word) {
  return `
你是英语记忆AI，请严格输出JSON，不要任何多余文字：

{
  "word": "${word}",
  "meaning_cn": "",
  "root_memory": "",
  "story": "",
  "exam_tip": ""
}
`;
}

// ======================
// CALL MODELS
// ======================
async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callOpenRouter(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callDeepSeek(prompt) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

// ======================
// SAFE JSON PARSE
// ======================
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  }
}

// ======================
// MULTI MODEL VOTING
// ======================
async function askAllModels(prompt) {
  const results = await Promise.allSettled([
    callGroq(prompt),
    callOpenRouter(prompt),
    callDeepSeek(prompt)
  ]);

  const parsed = results
    .filter(r => r.status === "fulfilled")
    .map(r => safeParse(r.value))
    .filter(Boolean);

  return parsed;
}

// ======================
// SIMPLE SCORING
// ======================
function scoreAnswer(ans) {
  let score = 0;
  if (ans.meaning_cn) score += 1;
  if (ans.root_memory) score += 1;
  if (ans.story) score += 1;
  if (ans.exam_tip) score += 1;
  return score;
}

// ======================
// MERGE BEST ANSWER
// ======================
function mergeAnswers(list) {
  if (!list.length) return null;

  let best = list[0];
  let bestScore = scoreAnswer(best);

  for (let i = 1; i < list.length; i++) {
    const s = scoreAnswer(list[i]);
    if (s > bestScore) {
      best = list[i];
      bestScore = s;
    }
  }

  return best;
}

// ======================
// MAIN API
// ======================
app.get("/memory", async (req, res) => {
  const word = req.query.word;
  if (!word) return res.json({ error: "missing word" });

  const key = crypto.createHash("md5").update(word).digest("hex");

  // 1. cache hit
  const cached = await getCache(key);
  if (cached) {
    return res.json({
      success: true,
      source: "cache",
      word,
      result: cached
    });
  }

  const prompt = buildPrompt(word);

  try {
    // 2. multi model
    const answers = await askAllModels(prompt);

    // 3. merge best
    const best = mergeAnswers(answers);

    if (!best) throw new Error("No valid AI response");

    // 4. save cache
    await setCache(key, best);

    res.json({
      success: true,
      source: "ai",
      word,
      result: best,
      models_used: answers.length
    });

  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

// ======================
app.get("/", (req, res) => {
  res.send("Anki AI Engine Pro 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Running on", PORT);
});
