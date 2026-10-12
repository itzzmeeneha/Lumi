/* LUMI frontend: one chat path, one recommendation path, one memory store. */
(function lumiApp() {
    "use strict";

    const logic = window.LumiMusicLogic;
    if (!logic) {
        console.error("LUMI music helpers could not load.");
        return;
    }

    const byId = function byId(id) { return document.getElementById(id); };
    const el = {
        universe: document.querySelector(".universe"),
        lumi: document.querySelector(".lumi"),
        leftEye: byId("leftEye"),
        rightEye: byId("rightEye"),
        leftEyeShape: byId("leftEyeShape"),
        rightEyeShape: byId("rightEyeShape"),
        leftCheek: byId("leftCheek"),
        rightCheek: byId("rightCheek"),
        mouth: byId("mouth"),
        leftSparkle: byId("leftSparkle"),
        rightSparkle: byId("rightSparkle"),
        searchInput: byId("searchInput"),
        searchButton: byId("searchButton"),
        searchResults: byId("searchResults"),
        songTitle: byId("songTitle"),
        songArtist: byId("songArtist"),
        playButton: byId("playButton"),
        playIcon: byId("playIcon"),
        previousButton: byId("previousButton"),
        nextButton: byId("nextButton"),
        progressTrack: byId("progressTrack"),
        progressFill: byId("progressFill"),
        currentTime: byId("currentTime"),
        totalTime: byId("totalTime"),
        equalizer: document.querySelector(".equalizer"),
        signature: byId("lumiSignature"),
        connectSpotify: byId("connectSpotify"),
        chatForm: byId("chatForm"),
        chatMessages: byId("chatMessages"),
        chatInput: byId("chatInput"),
        chatSendButton: byId("chatSendButton"),
        appStatus: byId("appStatus"),
        memoryButton: byId("memoryButton"),
        memoryPanel: byId("memoryPanel"),
        memoryContents: byId("memoryContents"),
        albumButton: byId("albumButton"),
        albumPanel: byId("albumPanel"),
        albumTracks: byId("albumTracks"),
        albumExplanation: byId("albumExplanation")
    };
    const EXPRESSIONS = {
        normal: { x: 1, y: 1, cheeks: 0.4, mouth: "M235 185 Q250 200 265 185" },
        puppy: { x: 1.05, y: 1.18, cheeks: 0.55, mouth: "M237 187 Q250 194 263 187" },
        happy: { x: 1.05, y: 0.62, cheeks: 0.62, mouth: "M230 183 Q250 205 270 183" },
        curious: { x: 1.03, y: 1.05, cheeks: 0.44, mouth: "M240 188 Q250 180 260 188" },
        excited: { x: 1.12, y: 1.16, cheeks: 0.68, mouth: "M232 180 Q250 210 268 180" },
        sleepy: { x: 1.02, y: 0.28, cheeks: 0.28, mouth: "M240 190 Q250 187 260 190" }
    };
    const MEMORY_KEY = "lumi_music_memory";
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = {
        memory: loadMemory(),
        conversation: [],
        chatBusy: false,
        musicRequestId: 0,
        lastIntent: null,
        player: null,
        deviceId: null,
        spotifyReady: false,
        spotifyState: null,
        isPlaying: false,
        currentTrack: null,
        sdkInitializing: false,
        sdkInitialized: false
    };

    function loadMemory() {
        try {
            return logic.createMemory(JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}"));
        } catch (error) {
            console.warn("LUMI memory was unreadable and has been reset.");
            return logic.createMemory({});
        }
    }

    function saveMemory() {
        try {
            localStorage.setItem(MEMORY_KEY, JSON.stringify(state.memory));
        } catch (error) {
            setStatus("LUMI could not save music memory in this browser.");
        }
    }

    window.showLumiMemory = function showLumiMemory() {
        return logic.createMemory(state.memory);
    };

    function setStatus(message) {
        if (el.appStatus) { el.appStatus.textContent = message || ""; }
    }

    function setNowPlaying(title, artist) {
        if (el.songTitle) { el.songTitle.textContent = title; }
        if (el.songArtist) { el.songArtist.textContent = artist; }
    }

    function formatTime(milliseconds) {
        const seconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
        return String(Math.floor(seconds / 60)) + ":" + String(seconds % 60).padStart(2, "0");
    }

    function setExpression(name) {
        const expression = EXPRESSIONS[name] || EXPRESSIONS.normal;
        if (!el.leftEyeShape || !el.rightEyeShape || !el.leftCheek || !el.rightCheek || !el.mouth) { return; }
        el.leftEyeShape.setAttribute("rx", String(27 * expression.x));
        el.leftEyeShape.setAttribute("ry", String(38 * expression.y));
        el.rightEyeShape.setAttribute("rx", String(27 * expression.x));
        el.rightEyeShape.setAttribute("ry", String(38 * expression.y));
        el.leftCheek.style.opacity = String(expression.cheeks);
        el.rightCheek.style.opacity = String(expression.cheeks);
        el.mouth.setAttribute("d", expression.mouth);
    }

    function sparkleEyes() {
        if (!el.leftSparkle || !el.rightSparkle || reducedMotion) { return; }
        el.leftSparkle.style.opacity = "1";
        el.rightSparkle.style.opacity = "1";
        window.setTimeout(function hideSparkles() {
            el.leftSparkle.style.opacity = "0";
            el.rightSparkle.style.opacity = "0";
        }, 420);
    }

    function setPlaybackState(isPlaying) {
        state.isPlaying = Boolean(isPlaying);
        if (el.universe) { el.universe.classList.toggle("is-playing", state.isPlaying); }
        if (el.signature) { el.signature.classList.toggle("is-playing", state.isPlaying); }
        if (el.equalizer) { el.equalizer.classList.toggle("is-playing", state.isPlaying); }
        if (el.playIcon) { el.playIcon.textContent = state.isPlaying ? "Ⅱ" : "▶"; }
        if (el.playButton) { el.playButton.setAttribute("aria-label", state.isPlaying ? "Pause music" : "Play music"); }
    }

    function initializeFace() {
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let attentionTimer;
        document.addEventListener("pointermove", function followPointer(event) {
            targetX = Math.max(-11, Math.min(11, (event.clientX - window.innerWidth / 2) / 55));
            targetY = Math.max(-11, Math.min(11, (event.clientY - window.innerHeight / 2) / 55));
            if (el.universe) {
                el.universe.classList.add("attention");
                window.clearTimeout(attentionTimer);
                attentionTimer = window.setTimeout(function calm() {
                    if (!state.isPlaying) { el.universe.classList.remove("attention"); }
                }, 800);
            }
        });
        function animateEyes() {
            currentX += (targetX - currentX) * 0.08;
            currentY += (targetY - currentY) * 0.08;
            [el.leftEye, el.rightEye].forEach(function moveEye(eye) {
                if (eye) { eye.style.transform = "translate(" + currentX + "px, " + currentY + "px)"; }
            });
            window.requestAnimationFrame(animateEyes);
        }
        function blink() {
            [el.leftEye, el.rightEye].forEach(function close(eye) { if (eye) { eye.classList.add("blink"); } });
            window.setTimeout(function open() {
                [el.leftEye, el.rightEye].forEach(function openEye(eye) { if (eye) { eye.classList.remove("blink"); } });
            }, 130);
            window.setTimeout(blink, 4500 + Math.random() * 3000);
        }
        if (!reducedMotion) {
            animateEyes();
            window.setTimeout(blink, 2800);
        }
        setExpression("normal");
    }

    function addChatMessage(message, sender, pending) {
        if (!el.chatMessages) { return null; }
        const bubble = document.createElement("div");
        bubble.className = sender === "lumi" ? "lumi-message" : "user-message";
        if (pending) { bubble.classList.add("is-pending"); }
        bubble.textContent = message;
        el.chatMessages.appendChild(bubble);
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
        return bubble;
    }

    function setChatBusy(isBusy) {
        state.chatBusy = isBusy;
        if (el.chatInput) { el.chatInput.disabled = isBusy; }
        if (el.chatSendButton) { el.chatSendButton.disabled = isBusy; }
    }

    function addHistory(role, text) {
        state.conversation.push({ role: role, text: text });
        state.conversation = state.conversation.slice(-12);
    }

    async function askLumi(message) {
        const cleanMessage = String(message || "").trim();
        if (!cleanMessage || state.chatBusy) {
            if (!cleanMessage) { setStatus("Type a message for LUMI first."); }
            return;
        }
        setChatBusy(true);
        addChatMessage(cleanMessage, "user");
        setExpression("curious");
        const currentTrackFeedback = logic.feedbackFromMessage(cleanMessage, state.currentTrack);
        if (currentTrackFeedback && logic.addMemoryValue(
            state.memory,
            currentTrackFeedback.category,
            currentTrackFeedback.value
        )) {
            saveMemory();
            renderMemory();
        }
        const thinking = addChatMessage("Thinking about that…", "lumi", true);
        try {
            const response = await fetch("http://localhost:3002/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: cleanMessage, history: state.conversation })
            });
            const data = await response.json().catch(function invalidJson() { return null; });
            if (!response.ok || !data) {
                throw new Error(data && data.error ? data.error : "LUMI could not respond right now.");
            }
            let reply = typeof data.reply === "string" && data.reply.trim()
                ? data.reply.trim() : "I’m here. Could you say that another way?";
            if (currentTrackFeedback) {
                reply = "Got it, I’ll avoid “" + currentTrackFeedback.value + "” from now on. " + reply;
            }
            if (thinking) {
                thinking.textContent = reply;
                thinking.classList.remove("is-pending");
            }
            addHistory("user", cleanMessage);
            addHistory("model", reply);
            const confirmedMemoryUpdate = logic.confirmMemoryUpdate(data.memoryUpdate, cleanMessage);
            const changed = logic.applyMemoryUpdate(state.memory, confirmedMemoryUpdate);
            if (changed.length) {
                saveMemory();
                renderMemory();
                setStatus("LUMI saved an explicit music preference.");
            }
            const intent = logic.validateMusicIntent(data.musicIntent);
            const languageFromMessage = logic.detectLanguage(cleanMessage);
            if (intent.musicRequest && languageFromMessage) { intent.language = languageFromMessage; }
            if (intent.musicRequest) {
                state.lastIntent = intent;
                void selectMusicForIntent(intent);
            } else if (intent.mood === "sad" || /\b(low|sad|upset|stressed)\b/i.test(cleanMessage)) {
                setExpression("puppy");
            } else {
                setExpression("normal");
            }
        } catch (error) {
            console.error("LUMI chat request failed:", error.message);
            if (thinking) {
                thinking.textContent = error.message || "I can’t reach my AI brain right now. Please try again.";
                thinking.classList.remove("is-pending");
            }
            setExpression("puppy");
            setStatus("Chat is unavailable. Check that the LUMI server is running.");
        } finally {
            setChatBusy(false);
            if (el.chatInput) { el.chatInput.focus(); }
        }
    }

    function renderSearchMessage(message) {
        if (!el.searchResults) { return; }
        el.searchResults.replaceChildren();
        const status = document.createElement("div");
        status.className = "search-message";
        status.textContent = message;
        el.searchResults.appendChild(status);
    }

    function trackImage(track) {
        const images = track && track.album && Array.isArray(track.album.images) ? track.album.images : [];
        const image = images[images.length - 1];
        return image && /^https:\/\//.test(image.url) ? image.url : "";
    }

    function makeTrackButton(track, actionLabel) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "track-row";
        button.setAttribute("aria-label", "Play " + track.name + " by " + logic.artistNames(track));
        const imageUrl = trackImage(track);
        if (imageUrl) {
            const image = document.createElement("img");
            image.src = imageUrl;
            image.alt = "";
            image.loading = "lazy";
            button.appendChild(image);
        } else {
            const art = document.createElement("span");
            art.className = "track-art-fallback";
            art.textContent = "✦";
            button.appendChild(art);
        }
        const text = document.createElement("span");
        text.className = "track-text";
        const title = document.createElement("strong");
        const artist = document.createElement("small");
        title.textContent = track.name;
        artist.textContent = logic.artistNames(track);
        text.append(title, artist);
        button.appendChild(text);
        if (actionLabel) {
            const action = document.createElement("span");
            action.className = "track-action";
            action.textContent = actionLabel;
            button.appendChild(action);
        }
        button.addEventListener("click", function playSelected() { void playSpotifyTrack(track); });
        return button;
    }

    function renderManualSearch(tracks) {
        if (!el.searchResults) { return; }
        el.searchResults.replaceChildren();
        if (!tracks.length) {
            renderSearchMessage("No Spotify tracks found.");
            return;
        }
        tracks.forEach(function showTrack(track) {
            el.searchResults.appendChild(makeTrackButton(track, "Play"));
        });
    }

    async function spotifyToken() {
        return typeof window.getValidSpotifyToken === "function" ? window.getValidSpotifyToken() : null;
    }

    function spotifyProblem(response) {
        if (response.status === 401) { return "Spotify access expired. Connect Spotify again."; }
        if (response.status === 403) { return "Spotify playback needs a Premium account and the required Spotify permissions."; }
        if (response.status === 404) { return "Spotify does not have an active playback device yet."; }
        return "Spotify could not complete that request.";
    }

    async function fetchSpotifyTracks(query, limit, token) {
        const accessToken = token || await spotifyToken();
        if (!accessToken) { throw new Error("Connect Spotify first to search and play music."); }
        // Spotify's February 2026 Web API change caps search pages at 10 items.
        const targetCount = Math.min(Math.max(Number(limit) || 10, 1), 30);
        const tracks = [];
        for (let offset = 0; offset < targetCount; offset += 10) {
            const pageLimit = Math.min(10, targetCount - offset);
            const url = "https://api.spotify.com/v1/search?q=" + encodeURIComponent(query)
                + "&type=track&limit=" + pageLimit + "&offset=" + offset;
            const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
            if (!response.ok) { throw new Error(spotifyProblem(response)); }
            const data = await response.json();
            const page = data && data.tracks && Array.isArray(data.tracks.items) ? data.tracks.items : [];
            tracks.push.apply(tracks, page);
            if (page.length < pageLimit) { break; }
        }
        return tracks;
    }

    async function searchSpotify() {
        const query = el.searchInput ? el.searchInput.value.trim() : "";
        if (!query) {
            renderSearchMessage("Type a song, artist, or vibe first.");
            return;
        }
        renderSearchMessage("Searching Spotify…");
        try {
            renderManualSearch(await fetchSpotifyTracks(query, 12));
        } catch (error) {
            renderSearchMessage(error.message);
            setStatus(error.message);
        }
    }

    async function initializeSpotify() {
        if (state.sdkInitialized || state.sdkInitializing || !window.Spotify) { return; }
        state.sdkInitializing = true;
        const token = await spotifyToken();
        if (!token) {
            state.sdkInitializing = false;
            setNowPlaying("CONNECT SPOTIFY", "TO ENABLE PLAYBACK");
            setStatus("Spotify is not connected. Check the registered callback URL, then connect again.");
            return;
        }
        state.sdkInitialized = true;
        state.sdkInitializing = false;
        state.player = new window.Spotify.Player({
            name: "LUMI",
            getOAuthToken: async function getOAuthToken(callback) {
                const token = await spotifyToken();
                if (token) { callback(token); }
            },
            volume: 0.5
        });
        state.player.addListener("ready", function ready(payload) {
            state.deviceId = payload.device_id;
            state.spotifyReady = true;
            setNowPlaying("LUMI IS READY", "SPOTIFY CONNECTED");
            setStatus("Spotify is ready.");
        });
        state.player.addListener("not_ready", function notReady() {
            state.spotifyReady = false;
            setStatus("Spotify player went offline.");
        });
        state.player.addListener("player_state_changed", updateSpotifyUI);
        state.player.addListener("initialization_error", function initializationError() {
            setStatus("Spotify’s player could not start. Refresh after connecting Spotify.");
        });
        state.player.addListener("authentication_error", function authenticationError() {
            setNowPlaying("SPOTIFY LOGIN EXPIRED", "CONNECT AGAIN");
            setStatus("Spotify login expired. Connect Spotify again.");
        });
        state.player.addListener("account_error", function accountError() {
            setNowPlaying("SPOTIFY PREMIUM REQUIRED", "FOR WEB PLAYBACK");
            setStatus("Spotify Web Playback requires a Premium account.");
        });
        state.player.connect().then(function connected(connected) {
            if (!connected) {
                setNowPlaying("SPOTIFY NOT CONNECTED", "CHECK LOGIN AND TRY AGAIN");
                setStatus("Spotify could not connect the player. Reconnect Spotify and check the callback URL.");
            }
        }).catch(function connectFailed() {
            setNowPlaying("SPOTIFY NOT CONNECTED", "CHECK LOGIN AND TRY AGAIN");
            setStatus("Spotify could not connect the player. Check your network and Spotify account permissions.");
        });
        window.setTimeout(function checkReadyTimeout() {
            if (state.sdkInitialized && !state.spotifyReady) {
                setNowPlaying("SPOTIFY NOT READY", "CHECK PREMIUM AND CALLBACK");
                setStatus("Spotify did not finish connecting. Confirm Premium, the callback URL, and that you approved access.");
            }
        }, 12000);
    }

    function updateProgress(position, duration) {
        if (el.currentTime) { el.currentTime.textContent = formatTime(position); }
        if (el.totalTime) { el.totalTime.textContent = formatTime(duration); }
        if (el.progressFill) {
            const percentage = duration ? Math.min(100, Math.max(0, position / duration * 100)) : 0;
            el.progressFill.style.width = String(percentage) + "%";
        }
    }

    function updateSpotifyUI(playerState) {
        if (!playerState || !playerState.track_window || !playerState.track_window.current_track) { return; }
        state.spotifyState = playerState;
        const track = playerState.track_window.current_track;
        const changedTrack = !state.currentTrack || state.currentTrack.id !== track.id;
        state.currentTrack = track;
        setNowPlaying(track.name, logic.artistNames(track));
        updateProgress(playerState.position, track.duration_ms);
        setPlaybackState(!playerState.paused);
        if (!playerState.paused) {
            setExpression(changedTrack ? "excited" : "happy");
            if (changedTrack) { sparkleEyes(); }
        } else {
            setExpression("sleepy");
        }
    }

    async function waitForSpotifyReady(timeout) {
        const started = Date.now();
        while (!state.spotifyReady && Date.now() - started < timeout) {
            await new Promise(function pause(resolve) { window.setTimeout(resolve, 200); });
        }
        return state.spotifyReady;
    }

    async function transferPlayback(token) {
        const response = await fetch("https://api.spotify.com/v1/me/player", {
            method: "PUT",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ device_ids: [state.deviceId], play: false })
        });
        if (!response.ok) { throw new Error(spotifyProblem(response)); }
    }

    async function playSpotifyTrack(track) {
        const token = await spotifyToken();
        if (!token) {
            const message = "Connect Spotify first to play music.";
            renderSearchMessage(message);
            setStatus(message);
            return false;
        }
        initializeSpotify();
        if (!await waitForSpotifyReady(6000)) {
            setNowPlaying("SPOTIFY NOT READY", "PLEASE WAIT");
            setStatus("Spotify player is not ready. Wait a moment, then try again.");
            return false;
        }
        try {
            await state.player.activateElement();
            await transferPlayback(token);
            const response = await fetch("https://api.spotify.com/v1/me/player/play?device_id="
                + encodeURIComponent(state.deviceId), {
                method: "PUT",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ uris: [track.uri], position_ms: 0 })
            });
            if (!response.ok) { throw new Error(spotifyProblem(response)); }
            state.currentTrack = track;
            setNowPlaying(track.name, logic.artistNames(track));
            setPlaybackState(true);
            setExpression("excited");
            sparkleEyes();
            logic.addRecentTrack(state.memory, {
                name: track.name, artist: logic.artistNames(track), uri: track.uri
            });
            saveMemory();
            renderMemory();
            if (el.searchResults) { el.searchResults.replaceChildren(); }
            setStatus("Playing " + track.name + " by " + logic.artistNames(track) + ".");
            return true;
        } catch (error) {
            console.error("Spotify playback failed:", error.message);
            setNowPlaying("SPOTIFY COULDN'T PLAY", "TRY ANOTHER TRACK");
            setStatus(error.message);
            return false;
        }
    }

    async function togglePlayback() {
        if (!state.player || !state.spotifyState) {
            setStatus("Choose a Spotify track first.");
            return;
        }
        try {
            await state.player.togglePlay();
        } catch (error) {
            setStatus("Spotify could not change playback.");
        }
    }

    async function selectMusicForIntent(rawIntent) {
        const intent = logic.validateMusicIntent(rawIntent);
        if (!intent.musicRequest) { return; }
        const requestId = ++state.musicRequestId;
        const plan = logic.buildSearchPlan(intent, state.memory);
        renderSearchMessage("LUMI is choosing " + plan.description + " music…");
        setStatus("Finding a " + plan.description + " match.");
        setExpression("curious");
        try {
            const token = await spotifyToken();
            if (!token) { throw new Error("Connect Spotify first, then LUMI can play this recommendation."); }
            const groups = await Promise.all(plan.queries.map(async function searchPlan(query) {
                const tracks = await fetchSpotifyTracks(query, 20, token);
                return tracks;
            }));
            if (requestId !== state.musicRequestId) { return; }
            const ranked = logic.rankTracks(groups.flat(), plan, state.memory);
            if (!ranked.length) {
                if (intent.song) {
                    const alternativeIntent = Object.assign({}, intent, {
                        song: null,
                        vibe: intent.vibe || ("similar to " + intent.song)
                    });
                    const alternativePlan = logic.buildSearchPlan(alternativeIntent, state.memory);
                    const alternatives = await Promise.all(alternativePlan.queries.map(function searchAlternative(query) {
                        return fetchSpotifyTracks(query, 10, token);
                    }));
                    if (requestId !== state.musicRequestId) { return; }
                    const rankedAlternatives = logic.rankTracks(alternatives.flat(), alternativePlan, state.memory).slice(0, 3);
                    if (rankedAlternatives.length) {
                        const message = "I couldn’t find that exact song. Here are a few close Spotify matches you can choose from:";
                        renderSearchMessage(message);
                        addChatMessage(message, "lumi");
                        rankedAlternatives.forEach(function showAlternative(item) {
                            if (el.searchResults) { el.searchResults.appendChild(makeTrackButton(item.track, "Play")); }
                        });
                        setStatus(message);
                        return;
                    }
                }
                const noMatch = intent.song ? "I couldn’t find that exact playable song on Spotify."
                    : intent.language ? "I couldn’t find a confident " + intent.language + " match. Try a song or artist name."
                        : "I couldn’t find a suitable playable track. Try a more specific vibe.";
                renderSearchMessage(noMatch);
                addChatMessage(noMatch, "lumi");
                setStatus(noMatch);
                setExpression("puppy");
                return;
            }
            const chosen = ranked[0].track;
            renderSearchMessage("Selected: " + chosen.name + " — " + logic.artistNames(chosen));
            const started = await playSpotifyTrack(chosen);
            if (started && requestId === state.musicRequestId) {
                const reason = (intent.language ? intent.language + " " : "")
                    + (intent.vibe || intent.mood || intent.genre || "personalized") + " request";
                const languageConfidence = intent.language ? logic.languageSignal(chosen, intent.language) : 0;
                const languageNote = intent.language && languageConfidence === 0
                    ? " Spotify doesn't label every track's language, so I used a " + intent.language + " focused search; this match could not be verified from track metadata."
                    : "";
                addChatMessage("I picked “" + chosen.name + "” by " + logic.artistNames(chosen)
                    + " for your " + reason + "." + languageNote, "lumi");
            }
        } catch (error) {
            if (requestId === state.musicRequestId) {
                renderSearchMessage(error.message);
                setStatus(error.message);
                setExpression("puppy");
            }
        }
    }

    function openPanel(id) {
        const panel = byId(id);
        if (!panel) { return; }
        const opening = panel.hidden;
        ["memoryPanel", "albumPanel"].forEach(function closeOther(otherId) {
            const other = byId(otherId);
            if (other && otherId !== id) { other.hidden = true; }
        });
        panel.hidden = !opening;
        if (el.memoryButton) { el.memoryButton.setAttribute("aria-expanded", String(id === "memoryPanel" && opening)); }
        if (opening) {
            const button = panel.querySelector("button");
            if (button) { button.focus(); }
        }
    }

    function renderMemory() {
        if (!el.memoryContents) { return; }
        el.memoryContents.replaceChildren();
        const labels = {
            favoriteArtists: "Favorite artists", favoriteGenres: "Favorite genres",
            favoriteSongs: "Favorite songs", dislikedArtists: "Avoid artists",
            dislikedGenres: "Avoid genres", dislikedSongs: "Avoid songs"
        };
        let hasMemory = false;
        logic.MEMORY_LISTS.forEach(function renderCategory(category) {
            const values = state.memory[category] || [];
            if (!values.length) { return; }
            hasMemory = true;
            const group = document.createElement("section");
            group.className = "memory-group";
            const title = document.createElement("h3");
            title.textContent = labels[category];
            const chips = document.createElement("div");
            chips.className = "memory-chips";
            values.forEach(function renderValue(value) {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "memory-chip";
                chip.dataset.category = category;
                chip.dataset.value = value;
                chip.setAttribute("aria-label", "Remove " + value + " from " + labels[category]);
                chip.textContent = value + " ×";
                chips.appendChild(chip);
            });
            group.append(title, chips);
            el.memoryContents.appendChild(group);
        });
        Object.keys(state.memory.moodPreferences || {}).forEach(function renderMood(mood) {
            const section = document.createElement("section");
            section.className = "memory-group";
            const title = document.createElement("h3");
            title.textContent = "For " + mood + " moods";
            const chips = document.createElement("div");
            chips.className = "memory-chips";
            (state.memory.moodPreferences[mood] || []).forEach(function renderPreference(preference) {
                const chip = document.createElement("button");
                chip.type = "button";
                chip.className = "memory-chip";
                chip.dataset.category = "moodPreferences";
                chip.dataset.value = mood + "::" + preference;
                chip.setAttribute("aria-label", "Remove " + preference + " from " + mood + " mood preferences");
                chip.textContent = preference + " ×";
                chips.appendChild(chip);
            });
            section.append(title, chips);
            el.memoryContents.appendChild(section);
        });
        const hasMoodMemory = Object.keys(state.memory.moodPreferences || {}).length > 0;
        if (!hasMemory && !hasMoodMemory) {
            const empty = document.createElement("p");
            empty.className = "memory-empty";
            empty.textContent = "Nothing saved yet. Tell LUMI what you love or dislike, for example: “I love indie pop.”";
            el.memoryContents.appendChild(empty);
        }
    }

    async function createAlbum() {
        openPanel("albumPanel");
        if (el.albumTracks) { el.albumTracks.replaceChildren(); }
        if (el.albumExplanation) { el.albumExplanation.textContent = "LUMI is gathering a small, no-duplicate Spotify collection…"; }
        const lastIntent = state.lastIntent || {
            musicRequest: true, mood: null, vibe: "dreamy", language: null, artist: null, genre: null, song: null
        };
        const intent = Object.assign({}, lastIntent, { song: null, musicRequest: true });
        const plan = logic.buildSearchPlan(intent, state.memory);
        try {
            const token = await spotifyToken();
            if (!token) { throw new Error("Connect Spotify first to build an album from real Spotify tracks."); }
            const groups = await Promise.all(plan.queries.map(async function albumQuery(query) {
                const tracks = await fetchSpotifyTracks(query, 30, token);
                return tracks;
            }));
            const selections = logic.rankTracks(groups.flat(), plan, state.memory)
                .slice(0, 7).map(function trackFromEntry(entry) { return entry.track; });
            if (!selections.length) {
                throw new Error("LUMI couldn't make a suitable collection yet. Try sharing an artist, genre, or mood.");
            }
            if (el.albumExplanation) {
                el.albumExplanation.textContent = "Built around your " + plan.description
                    + " direction, while avoiding saved dislikes and minimizing repeats.";
            }
            selections.forEach(function showTrack(track) {
                if (el.albumTracks) { el.albumTracks.appendChild(makeTrackButton(track, "Play")); }
            });
        } catch (error) {
            if (el.albumExplanation) { el.albumExplanation.textContent = error.message; }
            setStatus(error.message);
        }
    }

    function setupEvents() {
        if (el.searchButton) { el.searchButton.addEventListener("click", function searchClick() { void searchSpotify(); }); }
        if (el.searchInput) {
            el.searchInput.addEventListener("keydown", function searchKey(event) {
                if (event.key === "Enter") { event.preventDefault(); void searchSpotify(); }
            });
        }
        if (el.chatForm) {
            el.chatForm.addEventListener("submit", function chatSubmit(event) {
                event.preventDefault();
                const message = el.chatInput ? el.chatInput.value : "";
                if (el.chatInput) { el.chatInput.value = ""; }
                void askLumi(message);
            });
        }
        if (el.connectSpotify) {
            el.connectSpotify.addEventListener("click", function connect() {
                if (typeof window.loginWithSpotify === "function") { void window.loginWithSpotify(); }
            });
        }
        if (el.playButton) { el.playButton.addEventListener("click", function toggle() { void togglePlayback(); }); }
        if (el.previousButton) {
            el.previousButton.addEventListener("click", async function previous() {
                if (!state.player) { setStatus("Choose a Spotify track first."); return; }
                try { await state.player.previousTrack(); } catch (error) { setStatus("Spotify could not play the previous track."); }
            });
        }
        if (el.nextButton) {
            el.nextButton.addEventListener("click", async function next() {
                if (!state.player) { setStatus("Choose a Spotify track first."); return; }
                try { await state.player.nextTrack(); } catch (error) { setStatus("Spotify could not play the next track."); }
            });
        }
        if (el.progressTrack) {
            el.progressTrack.addEventListener("click", async function seek(event) {
                const current = state.spotifyState;
                if (!state.player || !current || !current.track_window || !current.track_window.current_track) { return; }
                const rect = el.progressTrack.getBoundingClientRect();
                const percentage = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
                try { await state.player.seek(current.track_window.current_track.duration_ms * percentage); }
                catch (error) { setStatus("Spotify could not seek in this track."); }
            });
        }
        if (el.memoryButton) { el.memoryButton.addEventListener("click", function memoryClick() { openPanel("memoryPanel"); }); }
        if (el.albumButton) { el.albumButton.addEventListener("click", function albumClick() { void createAlbum(); }); }
        document.querySelectorAll("[data-close-panel]").forEach(function closeListener(button) {
            button.addEventListener("click", function close() { openPanel(button.dataset.closePanel); });
        });
        if (el.memoryContents) {
            el.memoryContents.addEventListener("click", function memoryClick(event) {
                const chip = event.target.closest(".memory-chip");
                if (!chip) { return; }
                if (logic.removeMemoryValue(state.memory, chip.dataset.category, chip.dataset.value)) {
                    saveMemory();
                    renderMemory();
                    setStatus("That preference was removed from LUMI's memory.");
                }
            });
        }
    }

    function updateClock() {
        const current = state.spotifyState;
        if (current && !current.paused && current.track_window && current.track_window.current_track) {
            const duration = current.track_window.current_track.duration_ms;
            const position = Math.min(duration, current.position + Date.now() - current.timestamp);
            updateProgress(position, duration);
        }
        window.setTimeout(updateClock, 500);
    }

    function initializeParallax() {
        const layers = [
            [document.querySelector(".layer-small"), -8],
            [document.querySelector(".layer-medium"), -18],
            [document.querySelector(".layer-large"), -30]
        ];
        document.addEventListener("pointermove", function moveStars(event) {
            if (reducedMotion) { return; }
            const x = event.clientX / window.innerWidth - 0.5;
            const y = event.clientY / window.innerHeight - 0.5;
            layers.forEach(function moveLayer(item) {
                if (item[0]) { item[0].style.transform = "translate(" + x * item[1] + "px, " + y * item[1] + "px)"; }
            });
        });
    }

    window.onSpotifyWebPlaybackSDKReady = initializeSpotify;
    initializeFace();
    initializeParallax();
    setupEvents();
    renderMemory();
    addChatMessage("Hey, I’m LUMI. Tell me a mood, an artist, or what you want to hear.", "lumi");
    if (!localStorage.getItem("spotify_access_token")) {
        setNowPlaying("CONNECT SPOTIFY", "TO ENABLE PLAYBACK");
    }
    if (window.Spotify) { void initializeSpotify(); }
    updateClock();
}());
