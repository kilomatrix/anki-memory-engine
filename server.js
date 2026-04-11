import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

// ================= Redis =================
const redis = new Redis(process.env.REDIS_URL);

// ================= SQLite =================
const db = new sqlite3.Database("./memory.db");

// 初始化表
db.run(`
CREATE TABLE IF NOT EXISTS memory (
  word TEXT PRIMARY KEY,
  data TEXT,
  count INTEGER DEFAULT 0,
  updatedAt INTEGER
)
`);

// ================= 工具函数 =================
const timeoutFetch = (url, options, timeout = 8000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, r) => setTimeout(() => r(new Error("timeout")), timeout))
  ]);
};

// ================= 核心API =================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").toLowerCase();

  if (!word) {
    return res.json({ success: false, error: "empty word" });
  }

  try {
    // ================= L1 Redis =================
    const cache = await redis.get(word);
    if (cache) {
      return res.json({
        success: true,
        source: "redis",
        ...JSON.parse(cache)
      });
    }

    // ================= L2 SQLite =================
    const dbData = await new Promise((resolve) => {
      db.get("SELECT * FROM memory WHERE word=?", [word], (err, row) => {
        resolve(row);
      });
    });

    if (dbData) {
      const parsed = JSON.parse(dbData.data);

      // 写入 Redis（升温）
      await redis.set(word, dbData.data);

      return res.json({
        success: true,
        source: "sqlite",
        ...parsed
      });
    }

    // ================= L3 AI =================
    const ai = await timeoutFetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: `
你是英语记忆引擎，请生成结构化学习数据：

单词：${word}

返回JSON：
{
  "word": "",
  "meaning": "",
  "story": "",
  "memory": "",
  "example": ""
}
          `
        })
      },
      10000
    );

    const data = await ai.json();
    const text = data?.output?.[0]?.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        word,
        meaning: "AI解析失败",
        story: "fallback story",
        memory: "fallback memory",
        example: ""
      };
    }

    const finalData = {
      ...parsed,
      ts: Date.now(),
      source: "ai"
    };

    const str = JSON.stringify(finalData);

    // ================= 写入 SQLite =================
    db.run(
      "INSERT OR REPLACE INTO memory(word, data, count, updatedAt) VALUES (?, ?, 1, ?)",
      [word, str, Date.now()]
    );

    // ================= 写入 Redis =================
    await redis.set(word, str);

    return res.json({
      success: true,
      source: "ai",
      ...finalData
    });

  } catch (err) {
    console.error(err);

    return res.json({
      success: true,
      source: "fallback",
      word,
      meaning: "offline",
      story: `Offline memory for ${word}`,
      memory: "cached fallback",
    });
  }
});

// ================= health =================
app.get("/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// ================= start =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Memory Engine Pro running:", PORT);
});
