import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// 🔥 必须使用 Render PORT
// ======================
const PORT = process.env.PORT || 3000;
const OPENAI_KEY = process.env.OPENAI_KEY;

// ======================
// 🔥 健康检查（Render 用来判断服务是否活着）
// ======================
app.get("/", (req, res) => {
  res.send("Anki Memory Engine Running 🚀");
});

// ======================
// 核心 API
// ======================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").trim().toLowerCase();

  if (!word) {
    return res.json({ error: "no word" });
  }

  if (!OPENAI_KEY) {
    return res.json({ error: "OPENAI_KEY missing" });
  }

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
        presence_penalty: 0.8,
        frequency_penalty: 0.6,
        messages: [
          {
            role: "system",
            content: `
你是英语单词记忆AI。

只输出JSON，不要任何解释：

{
  "split": "词根拆分",
  "story": "记忆故事",
  "memory": "核心记忆",
  "tip": "动作提示"
}
`
          },
          {
            role: "user",
            content: `单词：${word}`
          }
        ]
      })
    });

    const data = await r.json();

    console.log("GPT RAW:", data);

    let content = data?.choices?.[0]?.message?.content || "";

    let jsonStr = content.match(/\{[\s\S]*\}/);

    if (!jsonStr) {
      throw new Error("No JSON found");
    }

    let result = JSON.parse(jsonStr[0]);

    return res.json({
      success: true,
      word,
      ...result
    });

  } catch (err) {
    console.log("AI ERROR:", err);

    return res.json({
      success: false,
      word,
      split: word,
      story: "AI解析失败",
      memory: "fallback",
      tip: "检查API或网络"
    });
  }
});

// ======================
// 🔥 关键：必须 listen
// ======================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
