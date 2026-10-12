"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = Number(process.env.PORT || 3002);
const GEMINI_MODELS = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-3.5-flash-lite")
    .split(",")
    .map(function cleanModel(model) { return model.trim(); })
    .filter(Boolean);
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

const EMPTY_INTENT = Object.freeze({
    musicRequest: false, mood: null, vibe: null, language: null, artist: null, genre: null, song: null
});
const EMPTY_MEMORY_UPDATE = Object.freeze({
    favoriteArtists: [], favoriteGenres: [], favoriteSongs: [], dislikedArtists: [],
    dislikedGenres: [], dislikedSongs: [], moodAssociations: []
});
const MEMORY_FIELDS = Object.keys(EMPTY_MEMORY_UPDATE).filter(function omitAssociations(key) {
    return key !== "moodAssociations";
});
const SUPPORTED_LANGUAGES = new Set(["English", "Hindi", "Tamil", "Telugu", "Malayalam"]);

function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function cleanList(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).reduce(function collect(result, item) {
        const clean = cleanText(item, 120);
        const key = clean.toLowerCase();
        if (clean && !seen.has(key) && result.length < 8) {
            seen.add(key);
            result.push(clean);
        }
        return result;
    }, []);
}

function cleanIntent(raw) {
    const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const language = cleanText(input.language, 20);
    return {
        musicRequest: input.musicRequest === true,
        mood: cleanText(input.mood, 40).toLowerCase() || null,
        vibe: cleanText(input.vibe, 60).toLowerCase() || null,
        language: SUPPORTED_LANGUAGES.has(language) ? language : null,
        artist: cleanText(input.artist, 120) || null,
        genre: cleanText(input.genre, 80) || null,
        song: cleanText(input.song, 140) || null
    };
}

function cleanMemoryUpdate(raw) {
    const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const result = {};
    MEMORY_FIELDS.forEach(function cleanField(field) { result[field] = cleanList(input[field]); });
    result.moodAssociations = (Array.isArray(input.moodAssociations) ? input.moodAssociations : [])
        .slice(0, 6)
        .map(function cleanAssociation(item) {
            return { mood: cleanText(item && item.mood, 40).toLowerCase(), preferences: cleanList(item && item.preferences) };
        })
        .filter(function validAssociation(item) { return item.mood && item.preferences.length; });
    return result;
}

function sanitizeHistory(rawHistory) {
    return (Array.isArray(rawHistory) ? rawHistory : [])
        .filter(function allowed(item) {
            return item && (item.role === "user" || item.role === "model") && typeof item.text === "string";
        })
        .slice(-12)
        .map(function toGeminiContent(item) {
            return { role: item.role, parts: [{ text: cleanText(item.text, 1000) }] };
        })
        .filter(function nonEmpty(item) { return item.parts[0].text; });
}

async function generateWithRetry(request) {
    let lastError;
    for (const model of GEMINI_MODELS) {
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            try {
                return await ai.models.generateContent({ ...request, model });
            } catch (error) {
                lastError = error;
                const retryable = error && [429, 503].includes(error.status);
                if (error && error.status === 404) { break; }
                if (!retryable) { throw error; }
                if (attempt < 2) {
                    await new Promise(function wait(resolve) { setTimeout(resolve, 300); });
                }
            }
        }
    }
    throw lastError || new Error("No Gemini model is configured.");
}

const SYSTEM_INSTRUCTION = `You are LUMI, a warm, playful, concise AI music companion.

Return ONLY valid JSON with exactly this shape:
{
  "reply": "short natural response",
  "musicIntent": {"musicRequest": false, "mood": null, "vibe": null, "language": null, "artist": null, "genre": null, "song": null},
  "memoryUpdate": {"favoriteArtists": [], "favoriteGenres": [], "favoriteSongs": [], "dislikedArtists": [], "dislikedGenres": [], "dislikedSongs": [], "moodAssociations": []}
}

Personality: friendly, emotionally aware, music-loving and casual. Do not use romantic nicknames. Do not mention internal fields or claim a track is playing before the app confirms playback.

Music intent: set musicRequest true only when the user explicitly asks to play, recommend, or listen to music. If they only share a mood (for example “I feel low”), respond empathetically and optionally ask whether they want music; do not start playback. Capture explicit song, artist, genre, vibe, mood and requested music language. Supported languages are English, Hindi, Tamil, Telugu and Malayalam. Language means the language of the music, not the reply. A current explicit language request is a hard request, not a preference.

Specific track rule: preserve an explicitly requested song and artist exactly. Never substitute a different song in your reply.

Memory: only include a memory update for a clear, long-term preference stated by the user (“I love Anirudh”, “I dislike EDM”). Do not turn a temporary request, a question, a model guess or a recommended track into saved preference. For mood associations use {"mood":"stressed","preferences":["artist or genre"]}. Use empty arrays if there is nothing clear to save.`;

app.use(cors());
app.use(express.json({ limit: "20kb" }));

// Serve frontend static assets directly from the repository root
app.use(express.static(path.join(__dirname, "..")));

app.get("/api/health", function healthCheck(req, res) {
    res.json({ service: "LUMI AI server", status: "ready" });
});

app.get("/", function rootHandler(req, res, next) {
    if (req.accepts("html")) {
        return res.sendFile(path.join(__dirname, "../index.html"));
    }
    return res.json({ service: "LUMI AI server", status: "ready" });
});

app.post("/api/chat", async function chat(req, res) {
    const message = cleanText(req.body && req.body.message, 600);
    if (!message) {
        return res.status(400).json({ error: "Please write a message for LUMI." });
    }
    if (!ai) {
        return res.status(503).json({ error: "LUMI's AI is not configured yet. Add GEMINI_API_KEY to .env and restart the server." });
    }

    const contents = sanitizeHistory(req.body.history);
    contents.push({ role: "user", parts: [{ text: message }] });

    try {
        const response = await generateWithRetry({
            contents,
            config: { responseMimeType: "application/json", systemInstruction: SYSTEM_INSTRUCTION }
        });
        const rawText = typeof response.text === "function" ? await response.text() : response.text;
        let parsed;
        try {
            parsed = JSON.parse(String(rawText || ""));
        } catch (error) {
            parsed = { reply: rawText };
        }
        return res.json({
            reply: cleanText(parsed.reply, 1000) || "I lost my thought for a moment. Could you say that again?",
            musicIntent: cleanIntent(parsed.musicIntent),
            memoryUpdate: cleanMemoryUpdate(parsed.memoryUpdate)
        });
    } catch (error) {
        console.error("LUMI AI request failed:", error && error.message ? error.message : "unknown error");
        return res.status(502).json({ error: "LUMI's AI is taking a little break. Please try again in a moment." });
    }
});

app.use(function invalidJson(error, req, res, next) {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ error: "Please send valid JSON." });
    }
    return next(error);
});

if (require.main === module) {
    app.listen(PORT, function started() {
        console.log(`LUMI AI server listening on http://localhost:${PORT}`);
    });
}

module.exports = { app, cleanIntent, cleanMemoryUpdate, sanitizeHistory };
