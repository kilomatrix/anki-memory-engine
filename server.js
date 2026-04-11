import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// =========================
// 1. 环境变量检查（防崩）
// =========================
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const GROQ_KEY = process.env.GROQ_KEY;

function hasKey(key) {
  return typeof key === "string" && key.length > 10;
}

// =========================
// 2. 安全工具（核心防崩）
// =========================
function safeStr(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function safeWord(word) {
  return safeStr(word).trim().toLowerCase();
}

// 🔥 修复 match 崩溃点
function safeMatch(str, regex) {
  try {
    if (typeof str !== "string") return null;
    return str.match(regex);
  } catch (e) {
    return null;
  }
}

// =========================
// 3. 超时 fetch（防卡死）
// =========================
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
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
// 4. AI fallback 链（稳定核心）
// =========================
async function callAI(word) {
  const prompt = `
给单词生成JSON：
{
 "split": "词根拆分",
 "story": "记忆故事",
 "memory": "记忆方法",
 "tip": "考试提示"
}
单词：${word}
只返回JSON，不要解释
`;

  // ---- DeepSeek ----
  if (hasKey(DEEPSEEK_KEY)) {
    try {
      const res = await fetchWithTimeout("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DEEPSEEK_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = tryParseJSON(text);
      if (parsed) return parsed;
    } catch (e) {}
  }

  // ---- OpenRouter ----
  if (hasKey(OPENROUTER_KEY)) {
    try {
      const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = tryParseJSON(text);
      if (parsed) return parsed;
    } catch (e) {}
  }

  // ---- GROQ ----
  if (hasKey(GROQ_KEY)) {
    try {
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      const parsed = tryParseJSON(text);
      if (parsed) return parsed;
    } catch (e) {}
  }

  // =========================
  // 兜底（永不崩）
  // =========================
  return {
    split: `${word}-（基础词拆分）`,
    story: `${word} 的简单记忆故事`,
    memory: `联想记忆：${word}`,
    tip: `考试中注意 ${word} 常见用法`,
  };
}

// =========================
// 5. JSON 安全解析（关键防崩）
// =========================
function tryParseJSON(text) {
  try {
    if (!text) return null;
    const match = safeMatch(text, /\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

// =========================
// 6. 主接口（Anki调用）
// =========================
app.get("/memory", async (req, res) => {
  try {
    const word = safeWord(req.query.word);

    if (!word) {
      return res.json({
        success: false,
        error: "empty word",
      });
    }

    const ai = await callAI(word);

    return res.json({
      success: true,
      word,
      split: safeStr(ai.split),
      story: safeStr(ai.story),
      memory: safeStr(ai.memory),
      tip: safeStr(ai.tip),
    });

  } catch (err) {
    // 🔥 最终兜底（绝不崩）
    return res.json({
      success: true,
      word: safeWord(req.query.word),
      split: "fallback-split",
      story: "fallback-story",
      memory: "fallback-memory",
      tip: "fallback-tip",
    });
  }
});

// =========================
// 7. health check
// =========================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Memory Engine v3 running on port", PORT);
});
