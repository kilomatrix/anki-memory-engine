import express from "express";

const app = express();
app.use(express.json());

const cache = new Map(); // ✅ 简易缓存

// =========================
// 超时 fetch
// =========================
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
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
// 🔥 超强 Prompt（关键）
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

你是API服务器，只返回JSON。

必须返回如下格式（不能有任何解释）：

{
  "word": "${word}",
  "split": "",
  "association": "",
  "bridge": "",
  "memory": ""
}

要求：
- 所有字段必须中文填写
- 不允许额外文本
- 不允许markdown
- 必须是合法JSON
`;
}

// =========================
// Provider（稳定排序）
// =========================
const providers = [
  {
    name: "zhipu",
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    key: () => process.env.ZHIPU_API_KEY,
    model: "glm-4-plus",
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
 
];

// =========================
// 调用模型
// =========================
async function callModel(p, word) {
  const key = p.key();
  if (!key) throw new Error("NO_KEY_" + p.name);

  const res = await fetchWithTimeout(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model,
      messages: [{ role: "user", content: buildPrompt(word) }],
      temperature: 0.5,
    }),
  });

  if (!res.ok) throw new Error(p.name + "_HTTP");

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

// =========================
// JSON修复器（🔥核心）
// =========================
function safeParse(text) {
  if (!text) return null;

  // 1️⃣ 直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 2️⃣ 提取 JSON
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

// =========================
// 字段修复（🔥关键）
// =========================
function normalize(result, word) {
  return {
    word: result?.word || word,
    split: result?.split || "",
    association: result?.association || "",
    bridge: result?.bridge || "",
    memory: result?.memory || "",
  };
}

// =========================
// 主AI流程（带fallback）
// =========================
async function getAI(word) {
  // ✅ 缓存命中
  if (cache.has(word)) {
    return cache.get(word);
  }

  let lastErr = null;

  for (const p of providers) {
    try {
      console.log("TRY:", p.name);

      const text = await callModel(p, word);
      const json = safeParse(text);

      if (json) {
        const finalData = normalize(json, word);

        // ✅ 写缓存
        cache.set(word, finalData);

        return finalData;
      }

      throw new Error("PARSE_FAIL");

    } catch (err) {
      console.log("FAIL:", p.name);
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
    const word = (req.query.word || "").trim();

    if (!word) {
      return res.status(400).json({ error: "missing_word" });
    }

    const result = await getAI(word);

    const html = `
<div style="font-size:14px; text-align:left; line-height:1.6; padding:8px;">
  <div>"word": "${result.word}",</div>
  <div>"split": "${result.split}",</div>
  <div>"association": "${result.association}",</div>
  <div>"bridge": "${result.bridge}",</div>
  <div>"memory": "${result.memory}"</div>
</div>
`;

res.setHeader("Content-Type", "text/html; charset=utf-8");
return res.send(html);

  } catch (err) {
    console.error("FINAL_ERROR:", err);

    return res.json({
      success: false,
      word: "",
      split: "",
      association: "",
      bridge: "",
      memory: "记忆生成失败，请稍后再试",
    });
  }
});

// =========================
app.get("/", (req, res) => {
  res.send("V6 Stable AI Running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("V6 running on", PORT);
});
