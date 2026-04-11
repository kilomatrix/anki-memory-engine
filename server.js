import express from "express";
import cors from "cors";

const app = express();

// ======================
// 基础中间件（稳定核心）
// ======================
app.use(cors());
app.use(express.json());

// ======================
// 健康检查（Render必备）
// ======================
app.get("/", (req, res) => {
  res.send("AI Memory Engine v2 Running 🚀");
});

// ======================
// AI记忆接口（核心）
// ======================
app.get("/memory", async (req, res) => {

  try {
    const word = (req.query.word || "").trim();

    if (!word) {
      return res.status(400).json({
        success: false,
        error: "word is required"
      });
    }

    // ======================
    // ⭐ AI逻辑（先用稳定mock，可后续接LLM）
    // ======================
    const response = generateMemory(word);

    return res.json({
      success: true,
      word,
      split: mockSplit(word),
      story: response.story,
      memory: response.memory,
      tip: response.tip
    });

  } catch (err) {
    console.error("ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "internal server error"
    });
  }
});

// ======================
// MOCK AI（稳定核心）
// ======================
function generateMemory(word) {

  return {
    story: `在一个语言世界里，“${word}”是一个关键角色，它不断被人们使用和记住。`,
    memory: `把 ${word} 想象成一个生活中的场景，让大脑建立画面记忆。`,
    tip: `每天重复使用 ${word} 3次，可以强化长期记忆。`
  };
}

// 简单拆分
function mockSplit(word) {
  if (word.length <= 3) return word;
  const mid = Math.floor(word.length / 2);
  return word.slice(0, mid) + "-" + word.slice(mid);
}

// ======================
// 启动服务（Render标准）
// ======================
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log("🚀 AI Memory Engine v2 running on port", port);
});
