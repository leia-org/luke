# @luke - Unified Realtime AI Communication

A TypeScript library that unifies OpenAI Realtime API and Gemini Live API, providing a server-side abstraction layer with WebSocket client connectivity and React components for audio handling.

## Features

- **Multi-provider support** - Use OpenAI and/or Gemini, client selects which to use
- **Dynamic audio sample rate** - Adapts to provider (24kHz for OpenAI, 16kHz for Gemini)
- **Flexible authentication** - JWT + custom validation callbacks
- **Multi-session handling** - Server manages concurrent sessions
- **Session mapping** - Link AI sessions to your database sessions
- **React components** - Ready-to-use `LukeProvider`, `AudioControls`, `TranscriptionDisplay`

## Packages

- **[@luke/client](./packages/client)**: React hooks and components for the frontend.
- **[@luke/server](./packages/server)**: Node.js WebSocket server and provider orchestration.

## Installation

```bash
pnpm add @luke/server @luke/client
```

## Development

To work on this repository:

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Build packages**:
   ```bash
   pnpm build
   ```

3. **Run example app**:
   ```bash
   cd examples/basic
   pnpm dev
   ```

## Server Usage

```typescript
import { createLukeServer, openai, gemini, z } from '@luke/server';

const server = createLukeServer({
  providers: [
    openai({ apiKey: process.env.OPENAI_API_KEY }),
    gemini({ apiKey: process.env.GEMINI_API_KEY }),
  ],

  auth: {
    jwt: { secret: process.env.JWT_SECRET },
    validate: async (decoded, req) => {
      const user = await db.users.find(decoded.sub);
      return user ? { userId: user.id } : null;
    }
  },

  session: {
    create: async (user, provider) => {
      return await db.sessions.create({ userId: user.userId });
    },
    onEnd: async (session, reason) => {
      await db.sessions.update(session.id, { endedAt: new Date() });
    }
  },

  config: {
    systemInstruction: 'You are a helpful assistant.',
    transcription: { input: true, output: true },
  },

  onTranscription: (transcription, session) => {
    console.log(`[${transcription.role}]: ${transcription.text}`);
  }
});

server.listen(3001);
```

## Client Usage

```tsx
import { LukeProvider, useLukeContext, AudioControls, TranscriptionDisplay } from '@luke/client';

function App() {
  return (
    <LukeProvider serverUrl="ws://localhost:3001" authToken={token}>
      <VoiceChat />
    </LukeProvider>
  );
}

function VoiceChat() {
  const { providers, selectProvider, transcription } = useLukeContext();

  return (
    <div>
      {providers.length > 1 && (
        <select onChange={(e) => selectProvider(e.target.value)}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <TranscriptionDisplay messages={transcription} />
      <AudioControls />
    </div>
  );
}
```

## Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  @luke/client   │◄──────────────────►│   @luke/server   │
│                 │                    │                  │
│  - LukeProvider │                    │  - Auth          │
│  - useLuke hook │                    │  - Sessions      │
│  - AudioWorker  │                    │  - Providers     │
└─────────────────┘                    └────────┬─────────┘
                                                │
                               ┌────────────────┴────────────────┐
                               │                                 │
                               ▼                                 ▼
                    ┌──────────────────┐              ┌──────────────────┐
                    │  OpenAI Realtime │              │   Gemini Live    │
                    │  (24kHz audio)   │              │  (16kHz input)   │
                    └──────────────────┘              └──────────────────┘
```

## License

MIT
