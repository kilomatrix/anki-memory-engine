import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/**
 * 统一配置（Render 环境变量）
 */
const PROVIDERS = {


  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    key: process.env.DEEPSEEK_API_KEY,
    model: "deepseek-chat",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
    body: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  },

  groq: {
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: process.env.GROQ_API_KEY,
    model: "llama-3.1-70b-versatile",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    }),
    body: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  },

  openrouter: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    model: "openai/gpt-4o-mini",
    headers: (key) => ({
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://your-app.com",
      "X-Title": "word-memory-app",
    }),
    body: (model, prompt) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  },
};

/**
 * 调用 AI
 */
async function callLLM(provider, prompt) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error("Unknown provider");

  const key = cfg.key;
  if (!key) throw new Error(`Missing API key for ${provider}`);

  const response = await fetch(cfg.url, {
    method: "POST",
    headers: cfg.headers(key),
    body: JSON.stringify(cfg.body(cfg.model, prompt)),
  });

  const data = await response.json();

  if (!data.choices?.[0]?.message?.content) {
    throw new Error(JSON.stringify(data));
  }

  return data.choices[0].message.content;
}

/**
 * prompt 生成
 */
function buildPrompt(word) {
  return `你是一位英语记忆专家，请对单词：${word} 做教学讲解：
1. 拆分记忆
2. 联想记忆
3. 中文桥接
4. 一句话口诀

请严格输出JSON格式：
{
  "word": "",
  "split": "",
  "association": "",
  "bridge": "",
  "mnemonic": ""
}`;
}

/**
 * API
 * /memory?word=apple&provider=openai
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;
    const provider = req.query.provider || "openai";

    if (!word) {
      return res.status(400).send({ error: "missing word" });
    }

    const prompt = buildPrompt(word);

    const result = await callLLM(provider, prompt);

    // 尝试解析 JSON（防止模型输出带代码块）
    let json;
    try {
      json = JSON.parse(result);
    } catch (e) {
      json = { raw: result };
    }

    res.json(json);
  } catch (err) {
    res.status(500).send({
      error: err.message,
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running...");
});
