// Example pool of available voices by gender
const VOICE_LIBRARY = {
  male: ["garrick", "osric", "tomas", "daelen"],
  female: ["seraphina", "lyra", "maeve", "elara"],
  neutral: ["echo", "neutral-one", "aria"]
};

// crude gender keyword detector (for fallback)
const GENDER_KEYWORDS = {
  male: ["man", "male", "boy", "king", "lord", "father", "son", "prince", "wizard"],
  female: ["woman", "female", "girl", "queen", "lady", "mother", "daughter", "princess", "witch"]
};

export function detectGender(description) {
  const text = description.toLowerCase();
  for (const word of GENDER_KEYWORDS.male) if (text.includes(word)) return "male";
  for (const word of GENDER_KEYWORDS.female) if (text.includes(word)) return "female";
  return "neutral";
}

export function assignVoice(npcName, description) {
  const gender = detectGender(description);
  const pool = VOICE_LIBRARY[gender] || VOICE_LIBRARY.neutral;
  // simple deterministic selection so the same NPC always gets the same voice
  const idx = Math.abs(hashCode(npcName)) % pool.length;
  return { gender, voice: pool[idx] };
}

function hashCode(str) {
  return str.split("").reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
}
