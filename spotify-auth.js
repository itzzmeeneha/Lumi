/* Spotify Authorization Code with PKCE. No client secret is used in the browser. */
(function spotifyAuth() {
    "use strict";

    const config = window.LUMI_CONFIG || {};
    function resolveRedirectUri() {
        if (config.spotifyRedirectUri) {
            return String(config.spotifyRedirectUri).trim();
        }
        if (typeof window !== "undefined" && window.location && window.location.origin) {
            return new URL("callback.html", window.location.href).href;
        }
        return "http://localhost:3002/callback.html";
    }
    const redirectUri = resolveRedirectUri();
    const scopes = [
        "streaming", "user-read-email", "user-read-private", "user-read-playback-state",
        "user-modify-playback-state", "user-read-currently-playing"
    ];

    const clientId = String(config.spotifyClientId || "").trim();

    function configured() {
        return Boolean(clientId && !clientId.startsWith("replace_"));
    }

    function showMessage(message) {
        const callbackMessage = document.querySelector(".message");
        const appStatus = document.getElementById("appStatus");
        if (callbackMessage) { callbackMessage.textContent = message; }
        if (appStatus) { appStatus.textContent = message; }
    }

    function randomString(length) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const bytes = crypto.getRandomValues(new Uint8Array(length));
        return Array.from(bytes, function toCharacter(byte) { return alphabet[byte % alphabet.length]; }).join("");
    }

    async function codeChallenge(verifier) {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const binary = String.fromCharCode.apply(null, new Uint8Array(digest));
        return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function saveTokens(data) {
        if (data && data.access_token) { localStorage.setItem("spotify_access_token", data.access_token); }
        if (data && data.refresh_token) { localStorage.setItem("spotify_refresh_token", data.refresh_token); }
        if (data && Number.isFinite(Number(data.expires_in))) {
            localStorage.setItem("spotify_expires_at", String(Date.now() + Number(data.expires_in) * 1000));
        }
    }

    async function tokenRequest(params) {
        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(params)
        });
        const data = await response.json().catch(function emptyResponse() { return {}; });
        if (!response.ok) { throw new Error(data.error_description || "Spotify token request failed."); }
        return data;
    }

    window.isSpotifyConfigured = configured;

    window.loginWithSpotify = async function loginWithSpotify() {
        if (!configured()) {
            showMessage("Add your Spotify client ID to config.js before connecting Spotify.");
            const title = document.getElementById("songTitle");
            const artist = document.getElementById("songArtist");
            if (title) { title.textContent = "SPOTIFY SETUP NEEDED"; }
            if (artist) { artist.textContent = "ADD CLIENT ID TO CONFIG.JS"; }
            return;
        }
        try {
            const verifier = randomString(64);
            const state = randomString(20);
            localStorage.setItem("spotify_pkce_verifier", verifier);
            localStorage.setItem("spotify_auth_state", state);
            const params = new URLSearchParams({
                response_type: "code",
                client_id: clientId,
                scope: scopes.join(" "),
                code_challenge_method: "S256",
                code_challenge: await codeChallenge(verifier),
                redirect_uri: redirectUri,
                state
            });
            window.location.assign("https://accounts.spotify.com/authorize?" + params.toString());
        } catch (error) {
            console.error("Spotify login could not start:", error);
            showMessage("Spotify connection could not start. Please try again.");
        }
    };

    window.refreshSpotifyToken = async function refreshSpotifyToken() {
        if (!configured()) { return null; }
        const refreshToken = localStorage.getItem("spotify_refresh_token");
        if (!refreshToken) { return null; }
        try {
            const data = await tokenRequest({
                grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId
            });
            saveTokens(data);
            return data.access_token || null;
        } catch (error) {
            console.warn("Spotify token refresh failed.");
            return null;
        }
    };

    window.getValidSpotifyToken = async function getValidSpotifyToken() {
        const token = localStorage.getItem("spotify_access_token");
        const expiresAt = Number(localStorage.getItem("spotify_expires_at"));
        if (token && expiresAt && Date.now() < expiresAt - 60000) { return token; }
        return window.refreshSpotifyToken();
    };

    async function handleCallback() {
        const params = new URLSearchParams(window.location.search);
        const error = params.get("error");
        const code = params.get("code");
        const returnedState = params.get("state");
        if (error) { showMessage("Spotify connection was cancelled."); return; }
        if (!code) { showMessage("Spotify did not return an authorization code."); return; }
        const verifier = localStorage.getItem("spotify_pkce_verifier");
        const savedState = localStorage.getItem("spotify_auth_state");
        if (!configured()) {
            showMessage("Add your Spotify client ID to config.js, then connect again.");
            return;
        }
        if (!verifier || !savedState || returnedState !== savedState) {
            showMessage("Spotify connection could not be verified. Please try again.");
            return;
        }
        try {
            const data = await tokenRequest({
                grant_type: "authorization_code", code, redirect_uri: redirectUri,
                client_id: clientId, code_verifier: verifier
            });
            saveTokens(data);
            localStorage.removeItem("spotify_pkce_verifier");
            localStorage.removeItem("spotify_auth_state");
            window.location.replace(new URL("./", redirectUri).href);
        } catch (error) {
            console.error("Spotify authorization failed:", error);
            showMessage("LUMI could not connect to Spotify. Please try again.");
        }
    }

    if (window.location.pathname.endsWith("/callback.html")) { handleCallback(); }
}());
