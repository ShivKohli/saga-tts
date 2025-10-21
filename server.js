import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// In-memory NPC→voice map
const knownVoices = {};

// OpenAI voice pool
// 🎙️ Current OpenAI-supported TTS voices
const VOICE_OPTIONS = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "coral",
  "verse",
  "ballad",
  "ash",
  "sage",
  "marin",
  "cedar"
];
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

    // Temporarily store audio locally (won’t persist on Vercel)
    fs.writeFileSync(filepath, buffer);

    // Return a fake short URL for GPT testing (no giant payload)
    res.json({
      audio_url: `https://saga-tts.vercel.app/audio/${filename}`,
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

// Root route for testing and health checks
app.get("/", (req, res) => {
  res.send(`
    <h2>🧙‍♂️ Saga TTS API is live!</h2>
    <p>Available endpoints:</p>
    <ul>
      <li>POST /tts</li>
      <li>GET /voices</li>
      <li>POST /voices/import</li>
    </ul>
    <p>Try POSTing to /tts with {"character": "Saga", "text": "Hello"}.</p>
  `);
});

// Serve audio files (temporary)
app.get("/audio/:filename", (req, res) => {
  const filepath = path.join("/tmp", req.params.filename);
  if (fs.existsSync(filepath)) {
    res.setHeader("Content-Type", "audio/mpeg");
    fs.createReadStream(filepath).pipe(res);
  } else {
    res.status(404).send("File not found");
  }
});

// Export app for Vercel
export default app;
