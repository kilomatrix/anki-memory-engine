import express from "express";

const app = express();
app.use(express.json());

const fetchFn = global.fetch;

// =========================
// 工具：超时 fetch（核心）
// =========================
async function fetchWithTimeout(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// =========================
// Prompt（稳定JSON输出）
// =========================
function buildPrompt(word) {
  return `
你是一名英语记忆专家 + 儿童教育专家。

请对单词 "${word}" 输出严格JSON（不能有任何多余文字）：

{
  "word": "${word}",
  "split": "拆分记忆",
  "association": "联想故事",
  "bridge": "中文桥接",
  "memory": "一句话记忆策略"
}

你是一个API，只能返回JSON，不能说任何解释。

严格输出以下JSON格式（必须100%合法JSON）：

{
  "word": "${word}",
  "split": "",
  "association": "",
  "bridge": "",
  "memory": ""
}

要求：
1. 所有字段必须填写
2. 不允许换行解释
3. 不允许多余文本
4. 不允许 markdown
5. 只返回 JSON
`;
}

// =========================
// provider列表（自动fallback）
// =========================
const providers = [
{
  name: "zhipu",
  url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  key: () => process.env.ZHIPU_API_KEY,
  model: "glm-4-plus",
  extraHeaders: {
    "Content-Type": "application/json"
  },
  {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    key: () => process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini",
  },
  {
    name: "deepseek",
    url: "https://api.deepseek.com/v1/chat/completions",
    key: () => process.env.DEEPSEEK_API_KEY,
    model: "deepseek-chat",
  },
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY,
    model: "llama-3.1-70b-versatile",
  },
  {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY,
    model: "openai/gpt-4o-mini",
    extraHeaders: {
      "HTTP-Referer": "https://anki-memory-engine",
      "X-Title": "anki-memory-engine",
    },
  },
];

// =========================
// 调用单个模型
// =========================
async function callModel(provider, word) {
  const key = provider.key();
  if (!key) throw new Error("NO_KEY_" + provider.name);

  const res = await fetchWithTimeout(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(provider.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "user", content: buildPrompt(word) }
      ],
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    throw new Error(provider.name + "_HTTP_" + res.status);
  }

  const data = await res.json();

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(provider.name + "_EMPTY");
  }

  return content;
}

// =========================
// JSON修复器（关键）
// =========================
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {}
    }
  }
  return null;
}

// =========================
// fallback核心
// =========================
async function getAI(word) {
  let lastErr = null;

  for (const p of providers) {
    try {
      console.log("TRY:", p.name);
      const result = await callModel(p, word);

      const json = safeParse(result);
      if (json) return json;

      throw new Error("PARSE_FAIL_" + p.name);
    } catch (err) {
      console.log("FAIL:", p.name, err.message);
      lastErr = err;
    }
  }

  throw lastErr;
}

// =========================
// API
// =========================
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;

    if (!word) {
      return res.status(400).json({
        error: "missing_word",
      });
    }

    const result = await getAI(word);

    return res.json({
      success: true,
  word: result.word || word,
  split: result.split || "",
  association: result.association || "",
  bridge: result.bridge || "",
  memory: result.memory || "",
    });

  } catch (err) {
    console.error("FINAL_ERROR:", err);

    return res.status(200).json({
      success: false,
      error: "ALL_PROVIDERS_FAILED",
      memory: "请稍后重试",
    });
  }
});

// =========================
app.get("/", (req, res) => {
  res.send("V5 AI Engine Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("V5 Stable AI running on", PORT);
});
