import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());

const OPENAI_KEY = process.env.OPENAI_KEY;

app.get("/memory", async (req, res) => {

  const word = (req.query.word || "").toLowerCase();

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
        messages: [
          {
            role: "system",
            content: `
你是英语记忆大师，为单词生成记忆方法。
只返回JSON：
{
"split":"",
"story":"",
"memory":"",
"tip":""
}
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
    let text = data.choices[0].message.content;

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      result = {
        split: word,
        story: "拆分记忆",
        memory: "重复",
        tip: "写3遍"
      };
    }

    res.json(result);

  } catch (e) {

    res.json({
      split: word,
      story: "离线模式",
      memory: "重复记忆",
      tip: "多写多读"
    });
  }
});

app.listen(10000, () => {
  console.log("running");
});
