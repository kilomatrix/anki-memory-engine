import express from "express";

const app = express();
app.use(express.json());

const fetchFn = global.fetch;

/**
 * =========================
 * 1. Prompt
 * =========================
 */
function prompt(word) {
  return `你是英语记忆专家，请对单词 "${word}" 输出严格JSON：

{
  "word": "${word}",
  "meaning": "中文含义",
  "memory": "记忆方法（拆分+联想+口诀）"
}

要求：
- 只输出JSON
- 不要解释
- 不要markdown
`;
}

/**
 * =========================
 * 2. Provider配置（运行时读取key）
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
 * 3. 带错误检查的请求
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

  // ❗关键：HTTP错误处理
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${p.name}_HTTP_${res.status}: ${text}`);
  }

  const data = await res.json();

  console.log("RAW RESPONSE:", p.name, JSON.stringify(data));

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`${p.name}_EMPTY_RESPONSE`);
  }

  return content;
}

/**
 * =========================
 * 4. fallback + 自动跳过无key
 * =========================
 */
async function run(word) {
  const providers = getProviders();

  let lastError = null;

  for (const p of providers) {
    try {
      // ❗自动跳过无key provider
      if (!p.key) {
        console.log("SKIP_NO_KEY:", p.name);
        continue;
      }

      console.log("TRY:", p.name);

      const result = await callProvider(p, word);

      console.log("USED:", p.name);

      return result;
    } catch (err) {
      console.log("FAIL:", p.name, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error("ALL_PROVIDERS_FAILED");
}

/**
 * =========================
 * 5. JSON安全解析（增强版）
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
 * 6. API
 * =========================
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;

    if (!word) {
      return res.status(400).json({ error: "missing word" });
    }

    const result = await run(word);

    const json = safeParse(result);

    res.json(json);
  } catch (err) {
    console.log("ERROR:", err.message);

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
  res.send("V3 Stable Engine Running 🚀");
});

/**
 * =========================
 * 8. Render启动必须
 * =========================
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
