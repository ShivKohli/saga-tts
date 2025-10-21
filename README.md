# Saga TTS API (Vercel Deployment)

A lightweight Text-to-Speech API powering the multi-voice narration system for **Saga, the AI Dungeon Master**.

## Features
- Dynamic NPC voice assignment (no predefined list)
- Ephemeral memory per session
- `/tts` → Generate voice audio
- `/voices` → Export current voice mappings
- `/voices/import` → Re-import saved voice mappings

## Deploy to Vercel

1. Clone or upload this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your GitHub repo.
4. Set an **Environment Variable**:
