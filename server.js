import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());

const OPENAI_KEY = process.env.OPENAI_KEY;

app.get("/memory", async (req, res) => {

  const word = (req.query.word || "").trim().toLowerCase();

  if (!word) {
    return res.json({ error: "no word" });
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

        // 🔥 关键：稳定输出控制
        temperature: 0.9,
        presence_penalty: 0.8,
        frequency_penalty: 0.6,

        messages: [
          {
            role: "system",
            content: `
你是【英语单词记忆AI大师】。

⚠ 必须严格返回 JSON（不能有任何解释文字）

格式如下：

{
  "split": "词根拆分（必须基于单词结构）",
  "story": "一个具体、有画面感的记忆故事（不能重复）",
  "memory": "一句话核心记忆方法（必须独特）",
  "tip": "具体动作或场景记忆技巧"
}

🚨 强制规则：
- 每个单词必须生成“完全不同内容”
- 禁止使用：重复记忆 / 多写多读 / 背下来等通用话术
- 必须围绕词形或语义联想
- 必须输出 JSON，不允许 Markdown
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

    console.log("GPT RAW:", data); // 🔥 用于调试

    let content = data?.choices?.[0]?.message?.content || "";

    console.log("GPT CONTENT:", content);

    // ======================
    // 🔥 强化 JSON 提取（关键修复）
    // ======================
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

    console.log("AI ERROR:", err.message);

    // ❌ fallback（只在真正失败才用）
    return res.json({
      success: false,
      word,
      split: word,
      story: "⚠ AI未返回有效结果（请检查API）",
      memory: "系统降级模式",
      tip: "请刷新或检查KEY"
    });
  }
});
