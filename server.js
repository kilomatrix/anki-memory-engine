import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(express.json());

// ======================
// ENV
// ======================
const GROQ_KEY = process.env.GROQ_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const REDIS_URL = process.env.REDIS_URL;

// ======================
// SIMPLE CACHE (Redis optional)
// ======================
let memoryCache = {};

async function getCache(key) {
  if (REDIS_URL) {
    try {
      const res = await fetch(`${REDIS_URL}/get/${key}`);
      const data = await res.json();
      return data?.value ? JSON.parse(data.value) : null;
    } catch {
      return memoryCache[key];
    }
  }
  return memoryCache[key];
}

async function setCache(key, value) {
  if (REDIS_URL) {
    try {
      await fetch(`${REDIS_URL}/set/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(value) })
      });
    } catch {
      memoryCache[key] = value;
    }
  } else {
    memoryCache[key] = value;
  }
}

// ======================
// PROMPT (结构化JSON)
// ======================
function buildPrompt(word) {
  return `
你是英语记忆AI，请严格输出JSON，不要任何多余文字：

{
  "word": "${word}",
  "meaning_cn": "",
  "root_memory": "",
  "story": "",
  "exam_tip": ""
}
`;
}

// ======================
// CALL MODELS
// ======================
async function callGroq(prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callOpenRouter(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

async function callDeepSeek(prompt) {
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content;
}

// ======================
// SAFE JSON PARSE
// ======================
function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  }
}

// ======================
// MULTI MODEL VOTING
// ======================
async function askAllModels(prompt) {
  const results = await Promise.allSettled([
    callGroq(prompt),
    callOpenRouter(prompt),
    callDeepSeek(prompt)
  ]);

  const parsed = results
    .filter(r => r.status === "fulfilled")
    .map(r => safeParse(r.value))
    .filter(Boolean);

  return parsed;
}

// ======================
// SIMPLE SCORING
// ======================
function scoreAnswer(ans) {
  let score = 0;
  if (ans.meaning_cn) score += 1;
  if (ans.root_memory) score += 1;
  if (ans.story) score += 1;
  if (ans.exam_tip) score += 1;
  return score;
}

// ======================
// MERGE BEST ANSWER
// ======================
function mergeAnswers(list) {
  if (!list.length) return null;

  let best = list[0];
  let bestScore = scoreAnswer(best);

  for (let i = 1; i < list.length; i++) {
    const s = scoreAnswer(list[i]);
    if (s > bestScore) {
      best = list[i];
      bestScore = s;
    }
  }

  return best;
}

// ======================
// MAIN API
// ======================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").trim();
  if (!word) {
    return res.json({ success: false, error: "empty word" });
  }

  try {
    const aiResponse = await timeoutFetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",   // 推荐模型：快 + 便宜
          messages: [
            {
              role: "system",
              content: "你是一个专业的英语单词记忆助手。请严格用以下JSON格式回复，不要添加任何其他文字和解释：\n" +
                       "{\"split\": \"单词拆分\", \"story\": \"生动故事\", \"tip\": \"记忆技巧\"}"
            },
            {
              role: "user",
              content: `单词: ${word}`
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      },
      15000
    );

    const data = await aiResponse.json();
    let content = data?.choices?.[0]?.message?.content || "";

    // 增强鲁棒性解析
    let split = "N/A";
    let story = content;
    let tip = "AI生成记忆技巧";

    try {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        split = parsed.split || split;
        story = parsed.story || story;
        tip = parsed.tip || tip;
      } else {
        // 简单文本提取
        split = content.match(/拆分[:：]\s*(.+?)(?:\n|$)/i)?.[1] || word.split('').join('-').slice(0, 10);
        tip = content.match(/技巧[:：]\s*(.+?)$/is)?.[1] || tip;
      }
    } catch (e) {
      console.error("Parse error:", e.message);
    }

    return res.json({
      success: true,
      source: "openai",
      word,
      split: split.trim(),
      story: story.trim(),
      memory: story.trim(),
      tip: tip.trim(),
      ts: Date.now()
    });

  } catch (err) {
    console.error("AI ERROR:", err.message);
    
    // 强力兜底（保证前端不显示 undefined）
    return res.json({
      success: true,
      source: "fallback",
      word,
      split: word.length > 3 ? word.slice(0, Math.floor(word.length/2)) + "-" + word.slice(Math.floor(word.length/2)) : word,
      story: `这是一个关于 "${word}" 的记忆故事（临时模式）。`,
      memory: `这是一个关于 "${word}" 的记忆故事（临时模式）。`,
      tip: "请检查 OpenAI API Key 是否正确设置在 Render 的 Environment Variables 中",
      fallback: true,
      error: err.message
    });
  }
});
