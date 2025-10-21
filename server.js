// server.js  — Saga TTS API (Vercel + Cloudflare R2 + OpenAI TTS)

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import AWS from "aws-sdk";
import cors from "cors";

// ──────────────────────────────────────────────────────────────
//  Setup
// ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// R2 connection
const r2 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
});

// ──────────────────────────────────────────────────────────────
//  Voice memory & helpers
// ──────────────────────────────────────────────────────────────
const knownVoices = {}; // Ephemeral voice assignments per session
const VOICE_OPTIONS = [
  "alloy", "echo", "fable", "onyx", "nova", "shimmer",
  "coral", "verse", "ballad", "ash", "sage", "marin", "cedar"
];
const randomVoice = () => VOICE_OPTIONS[Math.floor(Math.random() * VOICE_OPTIONS.length)];

// ──────────────────────────────────────────────────────────────
//  Routes
// ──────────────────────────────────────────────────────────────

// Health check
app.get("/", (req, res) => {
  res.send(`
    <h2>🧙‍♂️ Saga TTS API is live!</h2>
    <p>Available endpoints:</p>
    <ul>
      <li>POST /tts</li>
      <li>GET /voices</li>
      <li>POST /voices/import</li>
    </ul>
  `);
});

// Generate speech
app.post("/tts", async (req, res) => {
  try {
    const { character, text } = req.body;
    if (!character || !text)
      return res.status(400).json({ error: "Missing character or text field." });

    // assign or reuse voice
    if (!knownVoices[character]) {
      if (character.toLowerCase() === "saga") {
        knownVoices[character] = "verse"; // narrator fixed
      } else {
        knownVoices[character] = randomVoice();
      }
    }
    const voice = knownVoices[character];

    // call OpenAI TTS
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `tts_${Date.now()}_${character.replace(/\s+/g, "_")}.mp3`;

    // upload to Cloudflare R2
    await r2
      .putObject({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
        Body: buffer,
        ContentType: "audio/mpeg",
        ACL: "public-read",
      })
      .promise();

    const fileUrl = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${filename}`;

    res.json({
      audio_url: fileUrl,
      voice_used: voice,
    });
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Export current voice mapping
app.get("/voices", (req, res) => {
  res.json({ voices: knownVoices });
});

// Import previously saved mapping
app.post("/voices/import", (req, res) => {
  const { voices } = req.body;
  if (voices && typeof voices === "object") {
    Object.assign(knownVoices, voices);
    res.json({ message: "Voices imported successfully", voices: knownVoices });
  } else {
    res.status(400).json({ error: "Invalid voice mapping" });
  }
});

// Export for Vercel serverless
export default app;
