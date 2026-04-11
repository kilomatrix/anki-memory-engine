import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/**
 * =========================
 * 1. Provider配置
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
 * 2. Prompt（强约束JSON）
 * =========================
 */
function buildPrompt(word) {
  return `
你是一名英语记忆专家 + 儿童教育专家。

请对单词 "${word}" 进行分析，必须输出严格JSON（禁止任何解释、禁止markdown、禁止代码块）：

字段要求：
- word: 单词
- split: 拆分记忆（词根/音节）
- association: 联想故事（生动）
- bridge: 中文桥接记忆
- mnemonic: 一句话口诀（越短越好）

只输出JSON，不要多余内容。
`;
}

/**
 * =========================
 * 3. JSON修复器（关键）
 * =========================
 */
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    // 尝试截取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {}
    }
  }
  return { raw: text };
}

/**
 * =========================
 * 4. 调用模型
 * =========================
 */
async function callProvider(provider, prompt) {
  if (!provider.key) {
    throw new Error(`NO_KEY:${provider.name}`);
  }

  const res = await fetch(provider.url, {
    method: "POST",
    headers: provider.headers(provider.key),
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });

  const data = await res.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(`BAD_RESPONSE:${provider.name}`);
  }

  return content;
}

/**
 * =========================
 * 5. fallback核心逻辑
 * =========================
 */
async function runWithFallback(prompt) {
  let lastError = null;

  for (const p of providers) {
    try {
      const result = await callProvider(p, prompt);
      console.log("USED_PROVIDER:", p.name);
      return result;
    } catch (err) {
      console.log("FAILED_PROVIDER:", p.name, err.message);
      lastError = err;
      continue;
    }
  }

  throw lastError;
}

/**
 * =========================
 * 6. API接口
 * =========================
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;

    if (!word) {
      return res.status(400).json({ error: "missing word" });
    }

    const prompt = buildPrompt(word);

    const result = await runWithFallback(prompt);

    const json = safeParse(result);

    res.json(json);
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
  res.send("AI Memory Engine Running");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Stable AI Engine running...");
});
