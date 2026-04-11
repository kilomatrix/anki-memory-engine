import express from "express";

const app = express();

/**
 * Node18内置fetch
 */
const fetchFn = global.fetch;

/**
 * prompt
 */
function prompt(word) {
  return `对单词${word}输出JSON：
{
  "word":"${word}",
  "meaning":"",
  "memory":""
}`;
}

/**
 * safe parse
 */
function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text?.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : { raw: text };
  }
}

/**
 * 只保留 OpenAI（先保证能跑）
 */
async function callOpenAI(word) {
  const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt(word) }],
    }),
  });

  const data = await res.json();

  return data?.choices?.[0]?.message?.content;
}

/**
 * API
 */
app.get("/memory", async (req, res) => {
  try {
    const word = req.query.word;
    if (!word) return res.status(400).json({ error: "missing word" });

    const result = await callOpenAI(word);

    res.json(parse(result));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * health check
 */
app.get("/", (req, res) => {
  res.send("OK");
});

/**
 * Render必须
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("running on", PORT);
});
