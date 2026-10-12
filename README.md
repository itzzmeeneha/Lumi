# LUMI — AI Music Companion

LUMI is a small learning project that combines a Gemini chat companion with Spotify search and Web Playback. It keeps explicitly stated music preferences in the browser, then uses those preferences only as a tie-breaker behind the user's current request.

## What is included

- Gemini-backed, concise music conversation at `POST /api/chat`.
- Spotify Authorization Code with PKCE and Web Playback SDK integration.
- Safe local music memory: favorites, dislikes, mood associations, and de-duplicated recent tracks.
- Constraint-first recommendations: a requested song/artist and language are prioritized ahead of old preferences and popularity.
- Personalized album drawer built from real Spotify search results.
- Playback-aware LUMI expression, equalizer, and vertical-line visual signature.

## Setup

Requirements: Node.js 20+ and a Spotify Premium account for browser playback.

```bash
cd /Users/neha/Desktop/Lumi
npm install
```

Create `.env` from `.env.example` only if you do not already have it; keep your existing local credentials. The hosted app loads the public Spotify client configuration from `config.example.js`.

1. Put your Gemini key in `.env` as `GEMINI_API_KEY=...`.
2. In the Spotify Developer Dashboard, add `https://lumi-0o7y.onrender.com/callback.html` as an exact Redirect URI. For local development, also add `http://127.0.0.1:3002/callback.html`.
3. Set the Spotify application's **client ID** (never a client secret) in `config.example.js`. Both the main page and Spotify callback load this file.
4. Start the API:

```bash
npm start
```

5. Open the app at the origin that exactly matches `spotifyRedirectUri`, then select **Connect Spotify**. The Node server serves both the API and frontend at `http://127.0.0.1:3002/` locally and at the Render URL in production.

## Verify locally

```bash
npm run check
npm test
```

The tests use mocked Spotify track objects. They verify all five language paths, exact song priority, dislike/recent-history behavior, explicit memory confirmation, and backend input validation. Gemini chat has also been smoke-tested using a generic greeting and short music/preference examples. Spotify search and playback still need your Spotify sign-in and Premium account to verify live.

## How it works

1. The chat backend returns a human reply plus a small, validated music intent.
2. The browser saves only explicit preference updates in `lumi_music_memory`; a one-off request is not automatically a favorite.
3. For a play request, LUMI builds language-aware Spotify queries, filters disliked/unplayable tracks, then ranks candidates. Exact song/artist and language constraints come first; favorites and popularity only break ties.
4. When Spotify confirms the selected track, LUMI updates the player, expression, visual signature, and recent history.

## Honest limitations

- Spotify catalog metadata has no reliable universal language field. LUMI uses language-targeted queries and title/artist/album/script heuristics, and refuses clearly conflicting results. It cannot guarantee a language label for every catalog item.
- Web Playback requires Spotify Premium, an authorized user, the scopes in `spotify-auth.js`, and a registered redirect URI.
- Spotify search returns at most 10 results per request in the current Web API. LUMI follows the offset pagination limit when gathering candidates.
- The default Gemini models are `gemini-3.8-flash` and `gemini-3.5-flash-lite`; change `GEMINI_MODELS` in `.env` if your account cannot access them.
- Local memory is browser-specific. Clearing browser storage removes it.
