import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================
// 🧠 简易内存缓存（2.0核心升级）
// ======================
const memoryCache = new Map();

// TTL 10分钟缓存
const CACHE_TIME = 10 * 60 * 1000;

// ======================
// 🔥 Health Check
// ======================
app.get("/", (req, res) => {
  res.send("Memory Engine 2.0 🚀 Running");
});

// ======================
// 🧠 Memory API (2.0核心)
// ======================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").trim().toLowerCase();

  if (!word) return res.json({ error: "no word" });
  if (!OPENAI_KEY) return res.json({ error: "OPENAI_KEY missing" });

  // ======================
  // 🧠 CACHE HIT
  // ======================
  const cached = memoryCache.get(word);
  if (cached && Date.now() - cached.time < CACHE_TIME) {
    return res.json({
      success: true,
      word,
      cached: true,
      ...cached.data
    });
  }

  try {
    const result = await callAI(word);

    // 存缓存
    memoryCache.set(word, {
      time: Date.now(),
      data: result
    });

    return res.json({
      success: true,
      word,
      cached: false,
      ...result
    });

  } catch (err) {
    console.log("AI ERROR:", err.message);

    return res.json({
      success: false,
      word,
      split: word,
      story: "AI生成失败（已降级）",
      memory: "fallback mode",
      tip: "请重试或检查API"
    });
  }
});

// ======================
// 🤖 AI调用层（2.0稳定增强）
// ======================
async function callAI(word, retry = 2) {
  const prompt = `
你是英语单词记忆专家。

⚠ 必须严格输出 JSON（不能有任何额外文字）

格式：
{
  "split": "词根拆分（必须结构分析）",
  "story": "强画面记忆故事（必须具体）",
  "memory": "一句话核心记忆法（必须唯一）",
  "tip": "动作/场景辅助记忆"
}

规则：
- 禁止通用解释
- 禁止重复模板
- 必须基于词形或语义联想
- 必须可视化
`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.95,
      presence_penalty: 0.8,
      frequency_penalty: 0.6,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `word: ${word}` }
      ]
    })
  });

  const data = await r.json();

  const content = data?.choices?.[0]?.message?.content || "";

  console.log("RAW:", content);

  const json = extractJSON(content);

  if (!json && retry > 0) {
    console.log("Retrying AI...", retry);
    return callAI(word, retry - 1);
  }

  if (!json) throw new Error("Invalid JSON from AI");

  return json;
}

// ======================
// 🧠 JSON 安全解析（2.0增强）
// ======================
function extractJSON(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const obj = JSON.parse(match[0]);

    // 基础字段保护
    if (!obj.split || !obj.story || !obj.memory || !obj.tip) {
      return null;
    }

    return obj;

  } catch (e) {
    return null;
  }
}

// ======================
// 🔥 启动服务（必须）
// ======================
app.listen(PORT, () => {
  console.log("Memory Engine 2.0 running on port", PORT);
});
