# Luke Voice Chat Example

A complete example application demonstrating `@luke/server` and `@luke/client` integration.

## Structure

```
examples/basic/
├── server/
│   └── index.ts       # Express + Luke WebSocket server
├── src/
│   ├── main.tsx       # React entry point
│   ├── App.tsx        # Main app with auth
│   └── components/
│       ├── Login.tsx      # Login form
│       └── VoiceChat.tsx  # Voice chat UI
└── vite.config.ts     # Vite configuration
```

## Prerequisites

Set at least one API key:

```bash
export OPENAI_API_KEY=sk-...    # For OpenAI Realtime
export GEMINI_API_KEY=AIza...   # For Gemini Live
```

## Running the Example

From the monorepo root:

```bash
# Install dependencies
pnpm install

# Build the packages first
pnpm build

# Run the example
cd examples/basic
pnpm dev
```

This starts:
- **WebSocket Server**: `ws://localhost:3001` (Luke)
- **REST API**: `http://localhost:3002/api` (Auth)
- **Client**: `http://localhost:5173` (Vite)

## Usage

1. Open `http://localhost:5173` in your browser
2. Enter your name to "login" (demo auth)
3. Click **Connect** to establish WebSocket connection
4. Click the **microphone** button to start talking
5. Speak naturally - transcription will appear in real-time
6. The AI will respond with voice and text

## Features Demonstrated

- Multi-provider selection (if both API keys are set)
- Voice selection per provider
- Real-time transcription (user + assistant)
- Push-to-talk audio recording
- Session management with custom mapping
- JWT-style authentication flow
