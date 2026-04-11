import express from "express";

const app = express();
app.use(express.json());

/**
 * =========================
 * 0. fetch 兼容（Node18+）
 * =========================
 */
const fetchFn = global.fetch;

/**
 * =========================
 * 1. 安全获取key（关键修复）
 * =========================
 */
function getProviders() {
  return [
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
        "HTTP-Referer": "https://anki-engine",
        "X-Title": "anki-engine",
      }),
    },
  ];
}

/**
 * =========================
 * 2. timeout fetch（防502关键）
 * =========================
 */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetchFn(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * =========================
 * 3. prompt
 * =========================
 */
function buildPrompt(word) {
  return `
你是英语教育专家。

对单词 "${word}" 输出严格JSON：
{
  "word": "",
  "split": "",
  "association": "",
  "bridge": "",
  "mnemonic": ""
}
只输出JSON。
`;
}

/**
 * =========================
 * 4. 调用模型（增强版）
 * =========================
 */
async function callProvider(p, prompt) {
  if (!p.key) throw new Error("NO_KEY:" + p.name);

  const res = await fetchWithTimeout(
    p.url,
    {
      method: "POST",
      headers: p.headers(p.key),
      body: JSON.stringify({
        model: p.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    },
    15000
  );

  if (!res.ok) {
    throw new Error(`${p.name}_HTTP_${res.status}`);
  }

  const data = await res.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`${p.name}_EMPTY`);
  }

  return content;
}

/**
 * =========================
 * 5. fallback（runtime读取）
 * =========================
 */
async function runWithFallback(prompt) {
  const providers = getProviders();

  let lastError = null;

  for (const p of providers) {
    try {
      const result = await callProvider(p, prompt);
      console.log("USED:", p.name);
      return result;
    } catch (err) {
      console.log("FAIL:", p.name, err.message);
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * =========================
 * 6. JSON修复
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
 * 7. API
 * =========================
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;

    if (!word) {
      return res.status(400).json({ error: "missing word" });
    }

    const result = await runWithFallback(buildPrompt(word));

    res.json(safeParse(result));
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/**
 * =========================
 * 8. health
 * =========================
 */
app.get("/", (req, res) => {
  res.send("V3 Stable Engine OK");
});

/**
 * =========================
 * 9. Render必须
 * =========================
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Running on", PORT);
});
