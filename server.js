const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================
// 🧠 强制保持进程存活（防 Render exit）
// ======================
setInterval(() => {
  console.log("💓 heartbeat:", new Date().toISOString());
}, 25000);

// ======================
// 🚀 启动日志（必须看到）
// ======================
console.log("🚀 Server booting...");

// ======================
// 🧠 动态 fetch（Node 兼容方案）
// ======================
const fetchFn = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ======================
// ❤️ Health Check
// ======================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Memory Engine FINAL v4.0"
  });
});

// ======================
// 🧠 Memory API
// ======================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").trim().toLowerCase();

  if (!word) return res.json({ error: "no word" });
  if (!OPENAI_KEY) return res.json({ error: "missing OPENAI_KEY" });

  try {
    const result = await callOpenAI(word);
    return res.json({
      success: true,
      word,
      ...result
    });

  } catch (err) {
    console.log("❌ ERROR:", err.message);

    return res.json({
      success: false,
      word,
      split: word,
      story: "系统降级（AI不可用）",
      memory: "fallback mode",
      tip: "请稍后重试"
    });
  }
});

// ======================
// 🤖 OpenAI（Final Safe Mode）
// ======================
async function callOpenAI(word, retry = 2) {
  try {
    const r = await fetchFn("https://api.openai.com/v1/chat/completions", {
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

必须只返回JSON：

{
  "split": "",
  "story": "",
  "memory": "",
  "tip": ""
}

禁止任何多余文本。
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

    const text = data?.choices?.[0]?.message?.content || "";

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
// 🧠 JSON 安全解析（Final）
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

  } catch (e) {
    return null;
  }
}

// ======================
// 🚀 启动服务（关键）
// ======================
app.listen(PORT, () => {
  console.log("✅ Memory Engine FINAL running on port", PORT);
});

// ======================
// 🧯 防崩溃（Production必备）
// ======================
process.on("uncaughtException", (err) => {
  console.log("🔥 uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("🔥 unhandledRejection:", err);
});
