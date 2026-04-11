import express from "express";

const app = express();
app.use(express.json());

const fetchFn = global.fetch;

/**
 * =========================
 * 1. Provider统一配置
 * =========================
 */
const providers = [
  {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    key: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
  {
    name: "deepseek",
    url: "https://api.deepseek.com/v1/chat/completions",
    key: process.env.DEEPSEEK_API_KEY,
    model: "deepseek-chat",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: "llama-3.1-70b-versatile",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
  },
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: "openai/gpt-4o-mini",
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://anki-memory-engine",
      "X-Title": "anki-memory-engine",
    }),
  },
];

/**
 * =========================
 * 2. prompt
 * =========================
 */
function prompt(word) {
  return `对单词${word}输出严格JSON：
{
  "word": "${word}",
  "meaning": "",
  "memory": ""
}`;
}

/**
 * =========================
 * 3. JSON安全解析
 * =========================
 */
function safeParse(text) {
  if (!text) return { error: "empty_response" };

  try {
    return JSON.parse(text);
  } catch {}

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return { raw: text };
}

/**
 * =========================
 * 4. 单个provider调用
 * =========================
 */
async function callProvider(p, word) {
  const res = await fetchFn(p.url, {
    method: "POST",
    headers: p.headers(p.key),
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: "user", content: prompt(word) }],
      temperature: 0.7,
    }),
  });

  const data = await res.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("BAD_RESPONSE_" + p.name);
  }

  return content;
}

/**
 * =========================
 * 5. 核心：自动跳过无key + fallback
 * =========================
 */
async function runWithFallback(word) {
  let lastError = null;

  for (const p of providers) {
    try {
      // ✅ 关键：自动跳过没有 key 的 provider
      if (!p.key) {
        console.log("SKIP_NO_KEY:", p.name);
        continue;
      }

      console.log("TRY:", p.name);

      const result = await callProvider(p, word);
      console.log("USED:", p.name);

      return result;
    } catch (err) {
      console.log("FAILED:", p.name, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("ALL_PROVIDERS_FAILED");
}

/**
 * =========================
 * 6. API
 * =========================
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;

    if (!word) {
      return res.status(400).json({ error: "missing word" });
    }

    const result = await runWithFallback(word);

    res.json(safeParse(result));
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * =========================
 * 7. health check
 * =========================
 */
app.get("/", (req, res) => {
  res.send("Multi-AI Memory Engine Running 🚀");
});

/**
 * =========================
 * 8. Render启动
 * =========================
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
