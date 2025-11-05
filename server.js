// server.js — Saga TTS API (Vercel + Cloudflare R2 + OpenAI TTS)

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import AWS from "aws-sdk";
import cors from "cors";
import crypto from "crypto";

// ───────────────────────────────────────────────
// Setup
// ───────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cloudflare R2 setup
const r2 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

// ───────────────────────────────────────────────
// Voice Memory & Helpers
// ───────────────────────────────────────────────
const knownVoices = {}; // Persistent session mapping for character → voice

// 🎙️ Supported voices (as per OpenAI docs)
const VOICE_OPTIONS = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "cedar",
];

// 🎲 Deterministic voice assignment for NPCs
function getDeterministicVoice(name) {
  // Hash the name into a number
  const hash = crypto
    .createHash("md5")
    .update(name.toLowerCase())
    .digest("hex");
  const numeric = parseInt(hash.slice(0, 8), 16);
  const index = numeric % VOICE_OPTIONS.length;
  return VOICE_OPTIONS[index];
}

// ───────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.send(`
    <h2>🧙‍♂️ Saga TTS API is live!</h2>
    <p>Available endpoints:</p>
    <ul>
      <li>POST /tts — Generate TTS audio</li>
      <li>GET /voices — View current voice mapping</li>
      <li>POST /voices/import — Import saved voice mapping</li>
    </ul>
  `);
});

// ───────────────────────────────────────────────
// 🎧 Generate Speech
// ───────────────────────────────────────────────
app.post("/tts", async (req, res) => {
  try {
    const { character, text } = req.body;

    if (!character || !text) {
      return res
        .status(400)
        .json({ error: "Missing 'character' or 'text' field." });
    }

    // 🧍‍♂️ Skip player characters entirely
    if (character.toLowerCase().includes("(player")) {
      console.log(`🛑 Skipping TTS for player: ${character}`);
      return res.json({ skipped: true });
    }

    // 🎙️ Assign or reuse a consistent voice
    if (!knownVoices[character]) {
      if (character.toLowerCase() === "saga") {
        knownVoices[character] = "verse"; // fixed voice for Saga
      } else {
        knownVoices[character] = getDeterministicVoice(character);
      }
    }

    const voice = knownVoices[character];
    console.log(`🎙️ Generating voice for [${character}] → "${voice}"`);

    // 🎧 Generate TTS
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `tts_${Date.now()}_${character.replace(/\s+/g, "_")}.mp3`;

    // 🪣 Upload to Cloudflare R2
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
    res.status(500).json({
      error: err.message ?? "TTS generation failed.",
    });
  }
});

// ───────────────────────────────────────────────
// 🔄 Voice Map Management
// ───────────────────────────────────────────────
app.get("/voices", (req, res) => {
  res.json({ voices: knownVoices });
});

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

// ───────────────────────────────────────────────
// Export for Vercel
// ───────────────────────────────────────────────
export default app;
