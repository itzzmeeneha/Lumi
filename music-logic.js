/*
 * Pure, dependency-free helpers shared by the browser app and Node tests.
 * Keeping recommendation decisions here makes them easier to understand and
 * prevents UI code from quietly changing the selection rules.
 */
(function exposeLumiMusicLogic(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    root.LumiMusicLogic = api;
}(typeof window !== "undefined" ? window : globalThis, function createLogic() {
    "use strict";

    const MEMORY_LISTS = [
        "favoriteArtists",
        "favoriteGenres",
        "favoriteSongs",
        "dislikedArtists",
        "dislikedGenres",
        "dislikedSongs"
    ];

    const SUPPORTED_LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Malayalam"];
    const LANGUAGE_SEARCHES = {
        English: "English pop",
        Hindi: "Hindi Bollywood",
        Tamil: "Tamil film",
        Telugu: "Telugu film",
        Malayalam: "Malayalam film"
    };
    const LANGUAGE_MARKERS = {
        English: ["english", "anglophone"],
        Hindi: ["hindi", "bollywood", "desi"],
        Tamil: ["tamil", "kollywood"],
        Telugu: ["telugu", "tollywood"],
        Malayalam: ["malayalam", "mollywood"]
    };
    const LANGUAGE_SCRIPTS = {
        Hindi: /[\u0900-\u097f]/,
        Tamil: /[\u0b80-\u0bff]/,
        Telugu: /[\u0c00-\u0c7f]/,
        Malayalam: /[\u0d00-\u0d7f]/
    };
    const MOOD_TERMS = {
        sad: "comforting emotional",
        happy: "happy upbeat",
        calm: "calm relaxing",
        peaceful: "peaceful relaxing",
        energetic: "energetic high energy",
        excited: "energetic upbeat",
        romantic: "romantic",
        nostalgic: "nostalgic",
        angry: "intense",
        tired: "soft relaxing",
        stressed: "calm soothing"
    };

    function text(value, maxLength) {
        if (typeof value !== "string") {
            return "";
        }
        return value.trim().replace(/\s+/g, " ").slice(0, maxLength || 120);
    }

    function normalize(value) {
        return text(String(value || ""), 240)
            .toLocaleLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\p{L}\p{N}]+/gu, "");
    }

    function uniqueStrings(values, limit) {
        const seen = new Set();
        const result = [];
        (Array.isArray(values) ? values : []).forEach(function addValue(value) {
            const clean = text(value, 120);
            const key = normalize(clean);
            if (clean && key && !seen.has(key) && result.length < (limit || 30)) {
                seen.add(key);
                result.push(clean);
            }
        });
        return result;
    }

    function createMemory(raw) {
        const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        const memory = { moodPreferences: {}, recentMusic: [] };
        MEMORY_LISTS.forEach(function addList(key) {
            memory[key] = uniqueStrings(input[key], 30);
        });

        if (input.moodPreferences && typeof input.moodPreferences === "object" && !Array.isArray(input.moodPreferences)) {
            Object.entries(input.moodPreferences).slice(0, 12).forEach(function addMood(entry) {
                const mood = text(entry[0], 40).toLowerCase();
                const preferences = uniqueStrings(entry[1], 12);
                if (mood && preferences.length) {
                    memory.moodPreferences[mood] = preferences;
                }
            });
        }

        const seenTracks = new Set();
        (Array.isArray(input.recentMusic) ? input.recentMusic : []).forEach(function addTrack(item) {
            if (typeof item === "string") {
                const name = text(item, 140);
                const key = normalize(name);
                if (name && key && !seenTracks.has(key) && memory.recentMusic.length < 20) {
                    seenTracks.add(key);
                    memory.recentMusic.push({ name: name, artist: "", uri: "", playedAt: "" });
                }
                return;
            }
            if (!item || typeof item !== "object") {
                return;
            }
            const name = text(item.name, 140);
            const artist = text(item.artist, 140);
            const uri = text(item.uri, 180);
            const key = uri || normalize(name + artist);
            if (name && key && !seenTracks.has(key) && memory.recentMusic.length < 20) {
                seenTracks.add(key);
                memory.recentMusic.push({ name, artist, uri, playedAt: text(item.playedAt, 40) });
            }
        });
        return memory;
    }

    function addMemoryValue(memory, category, value) {
        if (!MEMORY_LISTS.includes(category)) {
            return false;
        }
        const clean = text(value, 120);
        if (!clean) {
            return false;
        }
        const list = uniqueStrings(memory[category], 30);
        if (list.some(function alreadySaved(item) { return normalize(item) === normalize(clean); })) {
            return false;
        }
        list.push(clean);
        memory[category] = list;
        return true;
    }

    function removeMemoryValue(memory, category, value) {
        if (category === "moodPreferences") {
            if (!memory.moodPreferences || typeof memory.moodPreferences !== "object") {
                memory.moodPreferences = {};
            }
            const parts = String(value || "").split("::");
            const mood = text(parts.shift(), 40).toLowerCase();
            const preference = parts.join("::");
            if (!mood || !memory.moodPreferences[mood]) { return false; }
            const before = memory.moodPreferences[mood].length;
            memory.moodPreferences[mood] = memory.moodPreferences[mood].filter(function keep(item) {
                return normalize(item) !== normalize(preference);
            });
            if (!memory.moodPreferences[mood].length) { delete memory.moodPreferences[mood]; }
            return memory.moodPreferences[mood]
                ? memory.moodPreferences[mood].length !== before
                : before > 0;
        }
        if (!MEMORY_LISTS.includes(category)) {
            return false;
        }
        const before = Array.isArray(memory[category]) ? memory[category].length : 0;
        memory[category] = uniqueStrings(memory[category], 30).filter(function keep(item) {
            return normalize(item) !== normalize(value);
        });
        return memory[category].length !== before;
    }

    function applyMemoryUpdate(memory, update) {
        const changed = [];
        if (!update || typeof update !== "object" || Array.isArray(update)) {
            return changed;
        }
        MEMORY_LISTS.forEach(function applyList(category) {
            if (!Array.isArray(update[category])) {
                return;
            }
            update[category].slice(0, 8).forEach(function applyValue(value) {
                if (addMemoryValue(memory, category, value)) {
                    changed.push(category);
                }
            });
        });

        if (Array.isArray(update.moodAssociations)) {
            update.moodAssociations.slice(0, 6).forEach(function applyAssociation(association) {
                if (!association || typeof association !== "object") {
                    return;
                }
                const mood = text(association.mood, 40).toLowerCase();
                const preferences = uniqueStrings(association.preferences, 12);
                if (!mood || !preferences.length) {
                    return;
                }
                const oldPreferences = memory.moodPreferences[mood] || [];
                const nextPreferences = uniqueStrings(oldPreferences.concat(preferences), 12);
                if (nextPreferences.length !== oldPreferences.length) {
                    memory.moodPreferences[mood] = nextPreferences;
                    changed.push("moodPreferences");
                }
            });
        }
        return changed;
    }

    function confirmMemoryUpdate(update, userMessage) {
        const input = update && typeof update === "object" && !Array.isArray(update) ? update : {};
        const message = text(userMessage, 600).toLowerCase();
        const positiveStatement = /\b(love|like|enjoy|favorite|favourite|fan of|obsessed with|listen to .*often|always listen to)\b/i.test(message);
        const negativeStatement = /\b(dislike|don't like|do not like|hate|can't stand|cannot stand|avoid)\b/i.test(message);
        const result = {};

        ["favoriteArtists", "favoriteGenres", "favoriteSongs"].forEach(function confirmFavorite(category) {
            result[category] = positiveStatement
                ? uniqueStrings(input[category], 8).filter(function mentioned(value) {
                    return normalize(message).includes(normalize(value));
                })
                : [];
        });
        ["dislikedArtists", "dislikedGenres", "dislikedSongs"].forEach(function confirmDislike(category) {
            result[category] = negativeStatement
                ? uniqueStrings(input[category], 8).filter(function mentioned(value) {
                    return normalize(message).includes(normalize(value));
                })
                : [];
        });

        result.moodAssociations = (Array.isArray(input.moodAssociations) ? input.moodAssociations : [])
            .slice(0, 6)
            .map(function confirmAssociation(association) {
                if (!association || typeof association !== "object") { return null; }
                const mood = text(association.mood, 40).toLowerCase();
                const preferences = uniqueStrings(association.preferences, 8).filter(function mentioned(value) {
                    return normalize(message).includes(normalize(value));
                });
                const hasAssociationLanguage = /\b(when|while|for)\b/i.test(message);
                return mood && preferences.length && hasAssociationLanguage
                    && new RegExp("\\b" + escapeRegExp(mood) + "\\b", "i").test(message)
                    ? { mood: mood, preferences: preferences }
                    : null;
            })
            .filter(Boolean);
        return result;
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function addRecentTrack(memory, track) {
        const next = {
            name: text(track && track.name, 140),
            artist: text(track && track.artist, 140),
            uri: text(track && track.uri, 180),
            playedAt: new Date().toISOString()
        };
        if (!next.name) {
            return;
        }
        const key = next.uri || normalize(next.name + next.artist);
        const recent = Array.isArray(memory.recentMusic) ? memory.recentMusic : [];
        memory.recentMusic = [next].concat(recent.filter(function keep(item) {
            const itemKey = text(item && item.uri, 180) || normalize((item && item.name) + (item && item.artist));
            return itemKey !== key;
        })).slice(0, 20);
    }

    function detectLanguage(message) {
        const input = text(message, 500).toLowerCase();
        const aliases = {
            English: /\benglish\b/,
            Hindi: /\b(hindi|bollywood)\b/,
            Tamil: /\b(tamil|kollywood)\b/,
            Telugu: /\b(telugu|tollywood)\b/,
            Malayalam: /\b(malayalam|mollywood)\b/
        };
        return SUPPORTED_LANGUAGES.find(function findLanguage(language) {
            return aliases[language].test(input);
        }) || null;
    }

    function validateMusicIntent(raw) {
        const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        const language = SUPPORTED_LANGUAGES.includes(text(input.language, 20))
            ? text(input.language, 20)
            : null;
        return {
            musicRequest: input.musicRequest === true,
            mood: text(input.mood, 40).toLowerCase() || null,
            vibe: text(input.vibe, 60).toLowerCase() || null,
            language,
            artist: text(input.artist, 120) || null,
            genre: text(input.genre, 80) || null,
            song: text(input.song, 140) || null
        };
    }

    function buildSearchPlan(rawIntent, memory) {
        const intent = validateMusicIntent(rawIntent);
        const safeMemory = createMemory(memory);
        const terms = [];
        if (intent.song) { terms.push(intent.song); }
        if (intent.artist) { terms.push(intent.artist); }
        if (intent.genre) { terms.push(intent.genre); }
        if (intent.mood && MOOD_TERMS[intent.mood]) { terms.push(MOOD_TERMS[intent.mood]); }
        if (intent.vibe) { terms.push(intent.vibe); }

        if (!intent.song && !intent.artist && !intent.genre && !intent.language) {
            if (safeMemory.favoriteArtists[0]) { terms.push(safeMemory.favoriteArtists[0]); }
            if (safeMemory.favoriteGenres[0]) { terms.push(safeMemory.favoriteGenres[0]); }
            const moodPreferences = safeMemory.moodPreferences[intent.mood] || [];
            if (moodPreferences[0]) { terms.push(moodPreferences[0]); }
        }

        const base = uniqueStrings(terms, 6).join(" ") || "feel good music";
        const languageQuery = intent.language ? LANGUAGE_SEARCHES[intent.language] + " " + base : base;
        const queries = uniqueStrings([languageQuery, intent.song ? base : ""], 2);
        return {
            intent,
            queries,
            language: intent.language,
            exactSong: Boolean(intent.song),
            exactArtist: Boolean(intent.artist),
            description: describeIntent(intent)
        };
    }

    function feedbackFromMessage(message, track) {
        const input = text(message, 600);
        if (!track || !text(track.name, 140)) { return null; }
        const songDislike = /\b(i\s+(?:really\s+)?(?:don't like|do not like|dislike|hate)|this song\s+(?:isn't|is not)\s+for me|not a fan of this song)\b/i;
        if (songDislike.test(input)) {
            return { category: "dislikedSongs", value: text(track.name, 140) };
        }
        return null;
    }

    function describeIntent(intent) {
        const phrases = [];
        if (intent.language) { phrases.push(intent.language); }
        if (intent.genre) { phrases.push(intent.genre); }
        if (intent.vibe) { phrases.push(intent.vibe); }
        if (intent.mood) { phrases.push(intent.mood); }
        return phrases.join(" ") || "personalized";
    }

    function artistNames(track) {
        return (Array.isArray(track && track.artists) ? track.artists : [])
            .map(function getName(artist) { return text(artist && artist.name, 140); })
            .filter(Boolean)
            .join(", ");
    }

    function trackText(track) {
        const album = track && track.album && track.album.name ? track.album.name : "";
        return [track && track.name, artistNames(track), album].join(" ").toLowerCase();
    }

    function trackGenres(track) {
        const values = [];
        if (Array.isArray(track && track.genres)) { values.push.apply(values, track.genres); }
        if (Array.isArray(track && track.artistGenres)) { values.push.apply(values, track.artistGenres); }
        if (track && typeof track.genre === "string") { values.push(track.genre); }
        (Array.isArray(track && track.artists) ? track.artists : []).forEach(function addArtistGenres(artist) {
            if (Array.isArray(artist && artist.genres)) { values.push.apply(values, artist.genres); }
        });
        return uniqueStrings(values, 30);
    }

    function languageSignal(track, language) {
        if (!language) {
            return 0;
        }
        const raw = trackText(track);
        const scripts = Object.keys(LANGUAGE_SCRIPTS).filter(function findScripts(other) {
            return LANGUAGE_SCRIPTS[other].test(raw);
        });
        if (scripts.length) {
            return scripts.includes(language) ? 2 : -2;
        }
        const markers = LANGUAGE_MARKERS[language] || [];
        if (markers.some(function markerMatches(marker) { return raw.includes(marker); })) {
            return 2;
        }
        const conflictingMarker = Object.keys(LANGUAGE_MARKERS).some(function findConflict(other) {
            return other !== language && LANGUAGE_MARKERS[other].some(function markerMatches(marker) {
                return raw.includes(marker);
            });
        });
        if (conflictingMarker) {
            return -2;
        }
        // Spotify has no track-language field. A search query alone is not proof
        // of language, so unlabelled catalog results remain uncertain.
        return 0;
    }

    function isInList(value, list) {
        const key = normalize(value);
        return (Array.isArray(list) ? list : []).some(function match(item) {
            const candidate = normalize(item);
            return candidate && (key === candidate || key.includes(candidate) || candidate.includes(key));
        });
    }

    function isDisliked(track, memory) {
        const safeMemory = createMemory(memory);
        const name = text(track && track.name, 140);
        if (isInList(name, safeMemory.dislikedSongs)) {
            return true;
        }
        if (artistNames(track).split(",").some(function artistDisliked(artist) {
            return isInList(artist, safeMemory.dislikedArtists);
        })) { return true; }
        return trackGenres(track).some(function genreDisliked(genre) {
            return isInList(genre, safeMemory.dislikedGenres);
        });
    }

    function isRecentlyPlayed(track, memory) {
        const name = normalize(track && track.name);
        const uri = text(track && track.uri, 180);
        return createMemory(memory).recentMusic.some(function isRecent(item) {
            return (uri && item.uri === uri) || (name && normalize(item.name) === name);
        });
    }

    function songMatches(track, requestedSong) {
        const wanted = normalize(requestedSong);
        const candidate = normalize(track && track.name);
        return Boolean(wanted && candidate && (candidate === wanted || candidate.startsWith(wanted) || wanted.startsWith(candidate)));
    }

    function artistMatches(track, requestedArtist) {
        const wanted = normalize(requestedArtist);
        return Boolean(wanted && artistNames(track).split(",").some(function matches(artist) {
            const candidate = normalize(artist);
            return candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate);
        }));
    }

    function rankTracks(tracks, plan, memory) {
        const safePlan = plan || buildSearchPlan({}, memory);
        const safeMemory = createMemory(memory);
        const seen = new Set();
        const ranked = [];
        (Array.isArray(tracks) ? tracks : []).forEach(function rank(track) {
            if (!track || !track.uri || track.is_playable === false || isDisliked(track, safeMemory)) {
                return;
            }
            const key = track.uri || normalize(track.name + artistNames(track));
            if (seen.has(key)) {
                return;
            }
            seen.add(key);

            if (safePlan.exactSong && !songMatches(track, safePlan.intent.song)) {
                return;
            }
            if (safePlan.exactArtist && !artistMatches(track, safePlan.intent.artist)) {
                return;
            }
            const language = languageSignal(track, safePlan.language);
            if (language < 0) {
                return;
            }

            let score = 0;
            if (safePlan.exactSong) { score += 1000; }
            if (safePlan.exactArtist) { score += 400; }
            if (language === 2) { score += 300; }
            if (language === 1) { score += 120; }
            if (!safePlan.language && isInList(artistNames(track), safeMemory.favoriteArtists)) { score += 24; }
            if (!safePlan.language && isInList(track.name, safeMemory.favoriteSongs)) { score += 20; }
            if (trackGenres(track).some(function favoriteGenre(genre) {
                return isInList(genre, safeMemory.favoriteGenres);
            })) { score += 18; }
            if (isRecentlyPlayed(track, safeMemory)) { score -= 80; }
            score += Math.min(Number(track.popularity) || 0, 100) / 100;
            ranked.push({ track, score, recent: isRecentlyPlayed(track, safeMemory), language });
        });
        ranked.sort(function compare(a, b) { return b.score - a.score; });
        const notRecent = ranked.filter(function withoutRecent(item) { return !item.recent; });
        return notRecent.length ? notRecent.concat(ranked.filter(function onlyRecent(item) { return item.recent; })) : ranked;
    }

    return {
        MEMORY_LISTS,
        SUPPORTED_LANGUAGES,
        addMemoryValue,
        addRecentTrack,
        applyMemoryUpdate,
        confirmMemoryUpdate,
        artistNames,
        buildSearchPlan,
        createMemory,
        detectLanguage,
        feedbackFromMessage,
        isDisliked,
        isRecentlyPlayed,
        languageSignal,
        normalize,
        rankTracks,
        removeMemoryValue,
        validateMusicIntent
    };
}));
