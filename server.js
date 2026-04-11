import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import sqlite3 from "sqlite3";
import Redis from "ioredis";

const app = express();
app.use(cors());
app.use(express.json());

// ================= Redis =================
let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL);
  console.log("✅ Redis connected");
} else {
  console.log("⚠️ Redis not configured");
}

// ================= SQLite =================
const db = new sqlite3.Database("./memory.db");

db.run(`
CREATE TABLE IF NOT EXISTS memory (
  word TEXT PRIMARY KEY,
  data TEXT,
  count INTEGER DEFAULT 1,
  correct INTEGER DEFAULT 0,
  wrong INTEGER DEFAULT 0,
  strength REAL DEFAULT 0.5,
  updatedAt INTEGER
)
`);

// ================= 工具 =================
function updateStrength(row, isCorrect) {
  let s = row?.strength || 0.5;
  s += isCorrect ? 0.1 : -0.15;
  if (s > 1) s = 1;
  if (s < 0) s = 0;
  return s;
}

// ================= AI Providers =================
async function callDeepSeek(word) {
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: `Explain "${word}" with meaning and memory trick` }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callOpenRouter(word) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: `Explain "${word}" with meaning and memory trick` }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callGroq(word) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama3-8b-8192",
      messages: [{ role: "user", content: `Explain "${word}" with meaning and memory trick` }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

// ================= AI调度 =================
async function callAI(word) {
  console.log("👉 AI start:", word);

  try {
    const r = await callDeepSeek(word);
    if (r) return { text: r, source: "deepseek" };
  } catch (e) {
    console.log("❌ deepseek", e.message);
  }

  try {
    const r = await callOpenRouter(word);
    if (r) return { text: r, source: "openrouter" };
  } catch (e) {
    console.log("❌ openrouter", e.message);
  }

  try {
    const r = await callGroq(word);
    if (r) return { text: r, source: "groq" };
  } catch (e) {
    console.log("❌ groq", e.message);
  }

  return {
    text: `Memory trick: "${word}" sounds familiar.`,
    source: "fallback"
  };
}

// ================= /memory =================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").toLowerCase();
  if (!word) return res.json({ success: false });

  try {
    // ===== Redis =====
    if (redis) {
      const cache = await redis.get(word);
      if (cache) {
        return res.json({
          success: true,
          source: "redis",
          ...JSON.parse(cache)
        });
      }
    }

    // ===== SQLite =====
    const row = await new Promise(resolve => {
      db.get("SELECT * FROM memory WHERE word=?", [word], (_, r) => resolve(r));
    });

    if (row) {
      const parsed = JSON.parse(row.data);

      db.run(
        "UPDATE memory SET count = count + 1, updatedAt=? WHERE word=?",
        [Date.now(), word]
      );

      if (redis) {
        await redis.set(word, row.data, "EX", 3600);
      }

      return res.json({
        success: true,
        source: "sqlite",
        ...parsed,
        strength: row.strength,
        count: row.count
      });
    }

    // ===== AI =====
    const ai = await callAI(word);

    const data = {
      word,
      story: ai.text,
      memory: ai.text,
      ts: Date.now()
    };

    const str = JSON.stringify(data);

    db.run(
      "INSERT INTO memory(word, data, updatedAt) VALUES (?, ?, ?)",
      [word, str, Date.now()]
    );

    if (redis) {
      await redis.set(word, str, "EX", 3600);
    }

    return res.json({
      success: true,
      source: ai.source,
      ...data
    });

  } catch (err) {
    console.log("❌ ERROR:", err);

    return res.json({
      success: true,
      source: "fallback",
      word,
      story: `Offline memory for ${word}`
    });
  }
});

// ================= /review =================
app.post("/review", async (req, res) => {
  const { word, correct } = req.body;

  const row = await new Promise(resolve => {
    db.get("SELECT * FROM memory WHERE word=?", [word], (_, r) => resolve(r));
  });

  if (!row) return res.json({ success: false });

  const newStrength = updateStrength(row, correct);

  db.run(
    `UPDATE memory 
     SET correct = correct + ?, 
         wrong = wrong + ?, 
         strength = ?, 
         updatedAt=? 
     WHERE word=?`,
    [
      correct ? 1 : 0,
      correct ? 0 : 1,
      newStrength,
      Date.now(),
      word
    ]
  );

  res.json({ success: true, strength: newStrength });
});

// ================= health =================
app.get("/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

// ================= start =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Memory Engine Pro running:", PORT);
});
