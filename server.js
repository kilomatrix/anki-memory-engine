import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ======================
// ENV KEYS（Render里配置）
// ======================
const GROQ_KEY = process.env.GROQ_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;

// ======================
// AI CALL: GROQ
// ======================
async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error("Groq failed");
  const data = await res.json();
  return data.choices[0].message.content;
}

// ======================
// AI CALL: OPENROUTER
// ======================
async function callOpenRouter(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error("OpenRouter failed");
  const data = await res.json();
  return data.choices[0].message.content;
}

// ======================
// AI CALL: DEEPSEEK
// ======================
async function callDeepSeek(prompt) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error("DeepSeek failed");
  const data = await res.json();
  return data.choices[0].message.content;
}

// ======================
// FALLBACK ENGINE
// ======================
async function askAI(prompt) {
  try {
    return await callGroq(prompt);
  } catch (e1) {
    console.log("Groq failed → switching OpenRouter");

    try {
      return await callOpenRouter(prompt);
    } catch (e2) {
      console.log("OpenRouter failed → switching DeepSeek");

      try {
        return await callDeepSeek(prompt);
      } catch (e3) {
        console.log("All AI failed");
        return "AI服务暂时不可用，请稍后再试";
      }
    }
  }
}

// ======================
// MEMORY API (核心)
// ======================
app.get("/memory", async (req, res) => {
  const word = req.query.word;

  if (!word) {
    return res.json({ error: "missing word" });
  }

  const prompt = `
你是一个英语学习助手，请输出：

单词：${word}
1. 中文意思
2. 词根联想
3. 一个短故事记忆法
4. 一个考试提示

格式要简洁清晰
`;

  try {
    const result = await askAI(prompt);

    res.json({
      success: true,
      word,
      result
    });
  } catch (err) {
    res.json({
      success: false,
      error: err.message
    });
  }
});

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("AI Memory Engine Running 🚀");
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
