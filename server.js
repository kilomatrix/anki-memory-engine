import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

// ===== 基础中间件 =====
app.use(cors());
app.use(express.json());

// ===== 超时控制 =====
const timeoutFetch = (url, options = {}, timeout = 8000) => {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), timeout)
    )
  ]);
};

// ===== 健康检查（Render 必备）=====
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: Date.now() });
});

// ===== AI 主接口（关键修复点）=====
app.get("/memory", async (req, res) => {
  const word = req.query.word || "";

  if (!word) {
    return res.json({
      success: false,
      error: "empty word"
    });
  }

  try {
    // ===== 这里替换成你的真实 AI API =====
    const aiResponse = await timeoutFetch(
      `https://api.openai.com/v1/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          input: `请用英语单词生成：词义+例句+记忆技巧：${word}`
        })
      },
      10000
    );

    const data = await aiResponse.json();

    const output =
      data?.output?.[0]?.content?.[0]?.text ||
      "AI解析失败";

    return res.json({
      success: true,
      word,
      story: output,
      memory: output,
      tip: "AI已生成",
      ts: Date.now()
    });

  } catch (err) {
    console.error("AI ERROR:", err.message);

    // ===== 兜底机制（防止前端显示空）=====
    return res.json({
      success: true,
      word,
      story: `fallback story for: ${word}`,
      memory: `fallback memory for: ${word}`,
      tip: "降级模式（API异常）",
      fallback: true
    });
  }
});

// ===== 启动 =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
