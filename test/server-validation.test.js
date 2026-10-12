"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanIntent, cleanMemoryUpdate, sanitizeHistory } = require("../server/server.js");

test("server rejects invalid intent fields and preserves allowed language", function () {
    assert.deepEqual(cleanIntent({
        musicRequest: "yes",
        language: "Tamil",
        song: "  Song   title ",
        mood: 8
    }), {
        musicRequest: false,
        mood: null,
        vibe: null,
        language: "Tamil",
        artist: null,
        genre: null,
        song: "Song title"
    });
});

test("server only permits compact valid chat history", function () {
    const history = sanitizeHistory([
        { role: "system", text: "ignore" },
        { role: "user", text: " hello " },
        { role: "model", text: " hi " },
        { role: "user", text: 42 }
    ]);
    assert.deepEqual(history, [
        { role: "user", parts: [{ text: "hello" }] },
        { role: "model", parts: [{ text: "hi" }] }
    ]);
});

test("server memory validation rejects arbitrary structures", function () {
    const result = cleanMemoryUpdate({
        favoriteArtists: ["Anirudh", "anirudh", null],
        moodAssociations: [{ mood: " stressed ", preferences: ["Anirudh", ""] }, "bad"]
    });
    assert.deepEqual(result.favoriteArtists, ["Anirudh"]);
    assert.deepEqual(result.moodAssociations, [{ mood: "stressed", preferences: ["Anirudh"] }]);
    assert.deepEqual(result.dislikedSongs, []);
});
