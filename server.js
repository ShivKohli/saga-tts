// server.js — Saga TTS API (Vercel + Cloudflare R2 + OpenAI TTS)

import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import AWS from "aws-sdk";
import cors from "cors";
import { assignVoice } from "./utils/voiceAssigner.js";

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
// Voice setup and mappings
// ───────────────────────────────────────────────
const knownVoices = {}; // runtime cache of { character: voice }
const FIXED_VOICES = {
  saga: "fable",
  narrator: "fable",
};

// Default fallback if voice detection somehow fails
const DEFAULT_VOICE = "echo";

// ───────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<h2>🧙‍♂️ Saga TTS API is live!</h2>`);
});

app.post("/tts", async (req, res) => {
  try {
    const { character, text, description, voice: requestedVoice } = req.body;

    if (!character || !text) {
      return res.status(400).json({ error: "Missing 'character' or 'text' field." });
    }

    const charKey = character.toLowerCase().trim();

    // ── Step 1: Fixed voices for Saga/narrator ─────────────────────────────
    if (charKey === "saga") {
      knownVoices[character] = FIXED_VOICES.saga;
    } else if (charKey === "narrator") {
      knownVoices[character] = FIXED_VOICES.narrator;
    }

    // ── Step 2: Determine or assign a voice ────────────────────────────────
    let finalVoice = requestedVoice || knownVoices[character];

    if (!finalVoice) {
      // New NPC or no previous voice found → use gender-aware assignment
      const { gender, voice } = assignVoice(character, description || text);
      knownVoices[character] = voice;
      finalVoice = voice;

      console.log(`🧩 Assigned ${character} (${gender}) → "${voice}"`);
    }

    console.log(`🎙️ Generating voice for [${character}] using "${finalVoice}"...`);

    // ── Step 3: Generate speech via OpenAI ────────────────────────────────
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: finalVoice,
      input: text,
    });

    // Safety check
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error("⚠️ Empty audio buffer received from OpenAI.");
      return res.status(500).json({ error: "OpenAI returned empty audio." });
    }

    const buffer = Buffer.from(arrayBuffer);
    const safeName = character.replace(/\s+/g, "_").replace(/[^\w_-]/g, "");
    const filename = `tts_${Date.now()}_${safeName}.mp3`;

    // ── Step 4: Upload to Cloudflare R2 ────────────────────────────────────
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

    // ── Step 5: Respond with info ─────────────────────────────────────────
    res.json({
      audio_url: fileUrl,
      voice_used: finalVoice,
      character,
    });
  } catch (err) {
    console.error("💥 TTS error:", err);
    res.status(500).json({ error: err.message ?? "TTS generation failed." });
  }
});

// ───────────────────────────────────────────────
// Voice mapping endpoints
// ───────────────────────────────────────────────
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
