"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../music-logic.js");

function track(name, artist, extra) {
    return Object.assign({
        name,
        uri: "spotify:track:" + encodeURIComponent(name.toLowerCase()),
        popularity: 50,
        artists: [{ name: artist }],
        album: { name: "" }
    }, extra || {});
}

test("explicit English request does not allow a Tamil-labelled candidate", function () {
    const plan = logic.buildSearchPlan({
        musicRequest: true,
        language: "English",
        vibe: "party"
    }, { favoriteArtists: ["Anirudh"] });
    const tamil = track("Arabic Kuthu", "Anirudh Ravichander", { album: { name: "Tamil film hits" } });
    const english = track("Levitating", "Dua Lipa", { album: { name: "English pop party" } });
    const result = logic.rankTracks([tamil, english], plan, {});
    assert.equal(result.length, 1);
    assert.equal(result[0].track.name, "Levitating");
});

test("Hindi plan creates a Hindi-oriented query and keeps a Hindi candidate", function () {
    const plan = logic.buildSearchPlan({
        musicRequest: true,
        language: "Hindi",
        mood: "energetic"
    }, {});
    assert.match(plan.queries[0], /Hindi Bollywood/i);
    const hindi = track("नाचो नाचो", "Vishal Mishra");
    const tamil = track("Tamil Party", "Artist", { album: { name: "Tamil hits" } });
    const result = logic.rankTracks([tamil, hindi], plan, {});
    assert.equal(result[0].track.name, "नाचो नाचो");
});

test("Tamil, Telugu, and Malayalam receive language-specific queries and script filtering", function () {
    const cases = [
        { language: "Tamil", correct: track("வாழ்க்கை", "Artist"), wrong: "నాచో" },
        { language: "Telugu", correct: track("నాచో నాచో", "Artist"), wrong: "ഹൃദയം" },
        { language: "Malayalam", correct: track("ഹൃദയം", "Artist"), wrong: "வாழ்க்கை" }
    ];
    cases.forEach(function verifyLanguage(item) {
        const plan = logic.buildSearchPlan({ musicRequest: true, language: item.language, vibe: "upbeat" }, {});
        assert.match(plan.queries[0], new RegExp(item.language, "i"));
        const wrong = track(item.wrong, "Artist");
        const result = logic.rankTracks([wrong, item.correct], plan, {});
        assert.equal(result.length, 1);
        assert.equal(result[0].track.name, item.correct.name);
    });
});

test("current language constraints suppress conflicting remembered artists", function () {
    const memory = { favoriteArtists: ["Anirudh"], favoriteGenres: ["Tamil film music"] };
    const plan = logic.buildSearchPlan({ musicRequest: true, language: "English", vibe: "party" }, memory);
    assert.doesNotMatch(plan.queries.join(" "), /Anirudh|Tamil/i);
    const result = logic.rankTracks([
        track("Plain title", "Anirudh"),
        track("Confident English", "Artist", { album: { name: "English pop" } })
    ], plan, memory);
    assert.equal(result[0].track.name, "Confident English");
});

test("memory personalizes open-ended searches and mood/vibe shape queries", function () {
    const memory = {
        favoriteArtists: ["Anirudh"],
        favoriteGenres: ["indie pop"],
        moodPreferences: { stressed: ["soft piano"] }
    };
    const personalized = logic.buildSearchPlan({ musicRequest: true, mood: "stressed" }, memory);
    assert.match(personalized.queries[0], /Anirudh/i);
    assert.match(personalized.queries[0], /indie pop/i);
    assert.match(personalized.queries[0], /soft piano/i);
    const intentPlan = logic.buildSearchPlan({ musicRequest: true, mood: "sad", vibe: "comforting" }, {});
    assert.match(intentPlan.queries[0], /comforting emotional/i);
    assert.match(intentPlan.queries[0], /comforting/i);
});

test("a specific requested song wins over popularity and saved favourite artist", function () {
    const plan = logic.buildSearchPlan({
        musicRequest: true,
        song: "Yellow",
        artist: "Coldplay"
    }, { favoriteArtists: ["Ariana Grande"] });
    const wanted = track("Yellow - Remastered 2011", "Coldplay", { popularity: 70 });
    const favourite = track("yes, and?", "Ariana Grande", { popularity: 100 });
    const result = logic.rankTracks([favourite, wanted], plan, { favoriteArtists: ["Ariana Grande"] });
    assert.equal(result.length, 1);
    assert.equal(result[0].track.name, wanted.name);
});

test("disliked tracks are excluded and recent tracks are only fallback choices", function () {
    const memory = logic.createMemory({
        dislikedSongs: ["Skip me"],
        recentMusic: [{ name: "Recent song", artist: "Artist", uri: "spotify:track:recent-song" }]
    });
    const plan = logic.buildSearchPlan({ musicRequest: true, vibe: "calm" }, memory);
    const result = logic.rankTracks([
        track("Skip me", "Artist"),
        track("Recent song", "Artist"),
        track("Fresh song", "Artist")
    ], plan, memory);
    assert.deepEqual(result.map(function names(item) { return item.track.name; }), ["Fresh song", "Recent song"]);
});

test("genre dislikes are filtered when catalog results include genre metadata", function () {
    const memory = { dislikedGenres: ["metal"], favoriteGenres: ["indie pop"] };
    const plan = logic.buildSearchPlan({ musicRequest: true, vibe: "upbeat" }, memory);
    const result = logic.rankTracks([
        track("Heavy", "Band", { artists: [{ name: "Band", genres: ["alternative metal"] }] }),
        track("Bright", "Singer", { genres: ["indie pop"] }),
        track("Unlabelled", "Artist")
    ], plan, memory);
    assert.deepEqual(result.map(function names(item) { return item.track.name; }), ["Bright", "Unlabelled"]);
    assert.ok(result[0].score > result[1].score);
});

test("memory rejects malformed saved data, de-duplicates recent tracks, and supports removal", function () {
    const memory = logic.createMemory({
        favoriteArtists: "not an array",
        recentMusic: [{ name: "Same", artist: "A", uri: "spotify:track:same" }]
    });
    assert.deepEqual(memory.favoriteArtists, []);
    logic.addRecentTrack(memory, { name: "Same", artist: "A", uri: "spotify:track:same" });
    assert.equal(memory.recentMusic.length, 1);
    logic.applyMemoryUpdate(memory, { favoriteArtists: ["Anirudh", "anirudh", 12] });
    assert.deepEqual(memory.favoriteArtists, ["Anirudh"]);
    assert.equal(logic.removeMemoryValue(memory, "favoriteArtists", "ANIRUDH"), true);
    assert.deepEqual(memory.favoriteArtists, []);
});

test("model memory guesses are saved only when the current text explicitly confirms them", function () {
    const proposed = {
        favoriteArtists: ["Anirudh"],
        favoriteGenres: ["indie pop"],
        dislikedSongs: ["Track Name"]
    };
    assert.deepEqual(logic.confirmMemoryUpdate(proposed, "Play an Anirudh song"), {
        favoriteArtists: [], favoriteGenres: [], favoriteSongs: [],
        dislikedArtists: [], dislikedGenres: [], dislikedSongs: [], moodAssociations: []
    });
    const confirmed = logic.confirmMemoryUpdate(proposed, "I love Anirudh and indie pop");
    assert.deepEqual(confirmed.favoriteArtists, ["Anirudh"]);
    assert.deepEqual(confirmed.favoriteGenres, ["indie pop"]);
    assert.deepEqual(confirmed.dislikedSongs, []);
});

test("explicit feedback about the current song creates only a song dislike", function () {
    const result = logic.feedbackFromMessage("I don't like this song", { name: "Track Name", artists: [{ name: "Artist" }] });
    assert.deepEqual(result, { category: "dislikedSongs", value: "Track Name" });
    assert.equal(logic.feedbackFromMessage("I feel sad", { name: "Track Name" }), null);
});

test("mood preferences can be removed and legacy recent title strings are normalized", function () {
    const memory = logic.createMemory({
        recentMusic: ["Old title"],
        moodPreferences: { calm: ["piano"] }
    });
    assert.equal(memory.recentMusic[0].name, "Old title");
    assert.equal(logic.removeMemoryValue(memory, "moodPreferences", "calm::piano"), true);
    assert.deepEqual(memory.moodPreferences, {});
});
