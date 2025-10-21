import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.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 });

// 💾 In-memory NPC→voice map
const knownVoices = {};

// 🎙️ OpenAI voice pool
const VOICE_OPTIONS = ["verse", "sol", "alloy", "ember", "charon"];
const randomVoice = () => VOICE_OPTIONS[Math.floor(Math.random() * VOICE_OPTIONS.length)];

/**
 * POST /tts
 * Generate TTS audio for a character line
 */
app.post("/tts", async (req, res) => {
  try {
    const { character, text } = req.body;
    if (!character || !text) return res.status(400).json({ error: "Missing character or text." });

    if (!knownVoices[character]) {
      knownVoices[character] = randomVoice();
    }

    const voice = knownVoices[character];
    const filename = `tts_${Date.now()}_${character.replace(/\s+/g, "_")}.mp3`;
    const filepath = path.join("/tmp", filename);

    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    // NOTE: Vercel does not support writing permanent files — use S3, Cloudflare R2, or return base64 instead.
    // For now, return a base64-encoded placeholder link.
    const audioBase64 = buffer.toString("base64");

    res.json({
      audio_url: `data:audio/mp3;base64,${audioBase64}`,
      voice_used: voice
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /voices
 * Returns current voice mappings for export
 */
app.get("/voices", (req, res) => {
  res.json({ voices: knownVoices });
});

/**
 * POST /voices/import
 * Import previously saved voice mappings
 */
app.post("/voices/import", (req, res) => {
  const { voices } = req.body;
  if (voices && typeof voices === "object") {
    Object.assign(knownVoices, voices);
    res.json({ message: "Voices imported successfully", voices: knownVoices });
  } else {
    res.status(400).json({ error: "Invalid voice mapping" });
  }
});

// ✅ Export app for Vercel
export default app;
