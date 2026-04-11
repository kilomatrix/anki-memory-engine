import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================
// 🧠 LRU CACHE（生产级）
// ======================
class LRUCache {
  constructor(limit = 200) {
    this.limit = limit;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return null;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);

    if (this.map.size > this.limit) {
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}

const cache = new LRUCache(300);

// ======================
// 🚦 简单限流（防爆OpenAI）
// ======================
let requestCount = 0;
setInterval(() => (requestCount = 0), 1000);

// ======================
// ❤️ Health Check（Render必备）
// ======================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Memory Engine 3.0"
  });
});

// ======================
// 🧠 Memory API
// ======================
app.get("/memory", async (req, res) => {
  try {
    const word = (req.query.word || "").trim().toLowerCase();
    if (!word) return res.json({ error: "no word" });
    if (!OPENAI_KEY) return res.json({ error: "missing key" });

    // 🚦 限流
    if (requestCount > 20) {
      return res.json({ error: "rate limited" });
    }
    requestCount++;

    // 🧠 cache
    const cached = cache.get(word);
    if (cached) {
      return res.json({
        success: true,
        word,
        cached: true,
        ...cached
      });
    }

    const data = await callOpenAI(word);

    cache.set(word, data);

    return res.json({
      success: true,
      word,
      cached: false,
      ...data
    });

  } catch (err) {
    console.log("FATAL ERROR:", err);

    return res.json({
      success: false,
      fallback: true,
      story: "系统降级模式",
      memory: "fallback",
      tip: "请稍后重试"
    });
  }
});

// ======================
// 🤖 OpenAI（3.0增强版）
// ======================
async function callOpenAI(word, retry = 2) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: `
你是英语单词记忆AI。

必须返回严格JSON：

{
  "split": "",
  "story": "",
  "memory": "",
  "tip": ""
}

禁止任何额外文本。
`
          },
          {
            role: "user",
            content: word
          }
        ]
      })
    });

    const data = await r.json();

    let text = data?.choices?.[0]?.message?.content || "";

    const json = safeParse(text);

    if (!json && retry > 0) {
      return callOpenAI(word, retry - 1);
    }

    if (!json) throw new Error("Invalid JSON");

    return json;

  } catch (e) {
    if (retry > 0) return callOpenAI(word, retry - 1);
    throw e;
  }
}

// ======================
// 🧠 安全JSON解析（3.0核心）
// ======================
function safeParse(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const obj = JSON.parse(match[0]);

    if (!obj.split || !obj.story || !obj.memory || !obj.tip) {
      return null;
    }

    return obj;

  } catch {
    return null;
  }
}

// ======================
// 🚀 关键启动（防Render挂）
// ======================
app.listen(PORT, () => {
  console.log("🚀 Memory Engine 3.0 running on", PORT);
});

// ======================
// 🧯 防 silent crash
// ======================
process.on("uncaughtException", (err) => {
  console.log("UNCUGHT:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("REJECTION:", err);
});
