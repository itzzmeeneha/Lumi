# 🎧 LUMI — AI Music Companion

**Your mood. Your music. Your moment.**

LUMI is an AI-powered music companion that combines conversational AI with Spotify to make music discovery more personal. It helps users explore music recommendations through natural conversation and discover songs that match their mood, preferences, and listening moments.

🔗 **[Live Demo](https://lumi-0o7y.onrender.com)** · **[GitHub Repository](https://github.com/itzzmeeneha/Lumi)**

---

## ✨ Features

- 🤖 **AI-Powered Conversations** — Interact with LUMI through a conversational interface powered by Google's Gemini API.
- 🎵 **Personalized Music Discovery** — Explore music recommendations based on your preferences and current mood.
- 🎧 **Spotify Integration** — Connect your Spotify account to search for music and access supported playback features.
- 💬 **Natural Language Interaction** — Describe what you feel or want to listen to instead of relying only on traditional searches.
- 🧠 **Music Memory** — Designed to make music discovery feel more personal by incorporating remembered preferences.
- 🌐 **Live Web Application** — Access LUMI online without running the project locally.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | Application structure |
| CSS3 | Styling and responsive interface |
| JavaScript | Frontend interactions and music logic |
| Node.js | Backend runtime |
| Express.js | API endpoints and web server |
| Google Gemini API | AI-powered conversations |
| Spotify Web API | Music search and Spotify integration |
| Spotify Authorization Code with PKCE | Browser-based Spotify authentication |
| Render | Application hosting and deployment |

## ⚙️ How It Works

1. **User interaction:** The user describes their mood, preferences, or music interests.
2. **AI processing:** The backend sends the conversation to the Gemini API and returns a response.
3. **Music discovery:** LUMI helps the user discover relevant music through Spotify integration.
4. **Spotify connection:** Users can authorize their Spotify account to access the supported Spotify features.
5. **Personalized experience:** Music-related interactions and supported memory features help make discovery more personal.

## 🚀 Try LUMI

Visit the live application:

### 👉 [Launch LUMI](https://lumi-0o7y.onrender.com)

Connect your Spotify account when prompted and start exploring music recommendations.

*Note: Spotify playback availability depends on the supported features, account eligibility, and Spotify's current requirements. The hosted application may take a little time to respond after a period of inactivity.*

## 💻 Run Locally

### Prerequisites

- Node.js 20 or later
- npm
- A Google Gemini API key
- A Spotify Developer application for Spotify features

### 1. Clone the repository

```bash
git clone https://github.com/itzzmeeneha/Lumi.git
cd Lumi
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root and add your Gemini API key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Never commit your real API key to GitHub.

### 4. Configure Spotify

Create a `config.js` file in the project root using `config.example.js` as a reference.

Configure your Spotify client ID and the appropriate callback URL:

```javascript
window.LUMI_CONFIG = {
    spotifyClientId: "your_spotify_client_id",
    spotifyRedirectUri: "http://127.0.0.1:3002/callback.html"
};
```

Register the exact redirect URI in your Spotify Developer Dashboard. Use the production callback URL for the deployed application and the local callback URL for local development.

**Security:** This browser-based PKCE implementation uses a public Spotify client ID. Never place a Spotify client secret in frontend code.

### 5. Start the application

```bash
npm start
```

Open the local address configured for your application in your browser.

### 6. Run checks and tests

Check JavaScript syntax:

```bash
npm run check
```

Run the test suite:

```bash
npm test
```

## 🔐 Security Notes

- Store the Gemini API key in environment variables.
- Keep `.env` and other private credentials out of version control.
- Never expose a Spotify client secret in frontend JavaScript.
- Use HTTPS and correctly configured redirect URIs for production authentication.

## 🌍 Deployment

LUMI is deployed on Render as a Node.js web service.

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variable:** `GEMINI_API_KEY`
- **Live application:** [lumi-0o7y.onrender.com](https://lumi-0o7y.onrender.com)

## 🔮 Future Improvements

- More context-aware music recommendations
- Improved music preference memory
- Enhanced recommendation explanations
- Additional automated tests
- Further improvements to accessibility and responsive design

## 👩‍💻 Author

**Neha N.**

Built as a project exploring AI-powered applications, personalized music discovery, and web development.

---

⭐ If you find LUMI interesting, check out the project and try the live demo!

