// server.js — Saga TTS API (Vercel + Cloudflare R2 + OpenAI TTS)
// /server.js — Saga TTS API

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import AWS from "aws-sdk";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const r2 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

// ───────────────────────────────────────────────
// Voice setup
// ───────────────────────────────────────────────
const knownVoices = {};
const FIXED_VOICES = {
  saga: "fable",
  narrator: "fable",
};

const VOICE_OPTIONS = [
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "marin", "nova", "onyx", "sage",
  "shimmer", "verse", "cedar"
];

const randomVoice = () => VOICE_OPTIONS[Math.floor(Math.random() * VOICE_OPTIONS.length)];

// ───────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<h2>🧙‍♂️ Saga TTS API is live!</h2>`);
});

app.post("/tts", async (req, res) => {
  try {
    const { character, text, voice: requestedVoice } = req.body;

    if (!character || !text) {
      return res.status(400).json({ error: "Missing 'character' or 'text' field." });
    }

    const charKey = character.toLowerCase().trim();

    // ✅ Use requested voice if provided
    if (!knownVoices[character]) {
      if (charKey === "saga") knownVoices[character] = FIXED_VOICES.saga;
      else if (charKey === "narrator") knownVoices[character] = FIXED_VOICES.narrator;
      else knownVoices[character] = FIXED_VOICES.npc_default;
    }

    const voice = requestedVoice || knownVoices[character];
    console.log(`🎙️ Generating voice for [${character}] using "${voice}"...`);

    // ✅ Generate TTS
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    // Safety check
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error("⚠️ Empty audio buffer received from OpenAI.");
      return res.status(500).json({ error: "OpenAI returned empty audio." });
    }

    const buffer = Buffer.from(arrayBuffer);
    const filename = `tts_${Date.now()}_${character.replace(/\s+/g, "_")}.mp3`;

    // ✅ Upload to Cloudflare R2
    await r2
      .putObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
        Body: buffer,
        ContentType: "audio/mpeg",
        ACL: "public-read",
      })
      .promise();

    const fileUrl = `https://${process.env.R2_PUBLIC_URL}/${filename}`;
    console.log(`✅ Uploaded to R2: ${fileUrl}`);

    res.json({
      audio_url: fileUrl,
      voice_used: voice,
    });
  } catch (err) {
    console.error("💥 TTS error:", err);
    res.status(500).json({ error: err.message ?? "TTS generation failed." });
  }
});

// Export mappings
app.get("/voices", (req, res) => res.json({ voices: knownVoices }));

app.post("/voices/import", (req, res) => {
  const { voices } = req.body;
  if (voices && typeof voices === "object") {
    Object.assign(knownVoices, voices);
    console.log("🔄 Imported voice mappings:", voices);
    res.json({ message: "Voices imported successfully", voices: knownVoices });
  } else {
    res.status(400).json({ error: "Invalid voice mapping payload." });
  }
});

export default app;
