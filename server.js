console.log("🚀 BOOT: Server file loaded");

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// ⚡ Render 必须：PORT绑定
// ======================
const PORT = process.env.PORT || 3000;

// ======================
// 💓 Heartbeat（防 Render 判定假死）
// ======================
setInterval(() => {
  console.log("💓 alive:", new Date().toISOString());
}, 20000);

// ======================
// 🔍 启动确认日志
// ======================
console.log("🟢 Initializing server...");

// ======================
// ❤️ Health Check（Render检测用）
// ======================
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Render Stable Template v1.0"
  });
});

// ======================
// 🧪 Test API（验证是否真的运行）
// ======================
app.get("/test", (req, res) => {
  res.send("OK - SERVER IS RUNNING");
});

// ======================
// 🚀 Memory API（占位逻辑）
// ======================
app.get("/memory", async (req, res) => {
  const word = (req.query.word || "").toLowerCase().trim();

  if (!word) {
    return res.json({ error: "no word provided" });
  }

  // 模拟稳定返回（先保证系统不炸）
  return res.json({
    success: true,
    word,
    split: "mock-split",
    story: "mock story for testing",
    memory: "mock memory",
    tip: "mock tip"
  });
});

// ======================
// 🚀 关键：必须 listen（Render检测点）
// ======================
app.listen(PORT, () => {
  console.log("✅ SERVER LISTENING ON PORT:", PORT);
});

// ======================
// 🧯 防崩溃（生产级必备）
// ======================
process.on("uncaughtException", (err) => {
  console.log("🔥 uncaughtException:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("🔥 unhandledRejection:", err);
});
