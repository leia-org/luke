# @luke/client

React client library for the Luke realtime AI voice communication platform.

## Features

- **LukeProvider**: Context provider that manages the WebSocket connection and audio state.
- **AudioControls**: Ready-made component for microphone and speaker control.
- **TranscriptionDisplay**: Component to show real-time transcripts from the conversation.
- **Hooks**: Custom hooks like `useLukeContext` for building custom UI.

## Installation

```bash
pnpm add @luke/client
```

## Usage

Wrap your application (or the part that needs voice features) with `LukeProvider`.

```tsx
import { LukeProvider, useLukeContext, AudioControls, TranscriptionDisplay } from '@luke/client';

function App() {
  const token = "your_auth_token_here";
  const serverUrl = "ws://localhost:3001";

  return (
    <LukeProvider serverUrl={serverUrl} authToken={token}>
      <VoiceChat />
    </LukeProvider>
  );
}

function VoiceChat() {
  const { providers, selectProvider, transcription } = useLukeContext();

  return (
    <div>
      <h3>Conversation</h3>
      <AudioControls />
      <TranscriptionDisplay messages={transcription} />
    </div>
  );
}
```

## API

### LukeProvider Props

- `serverUrl` (string): The WebSocket URL of your Luke server.
- `authToken` (string): JWT or auth token for connection.
- `onError` (function): Callback for connection errors.

### useLukeContext

Returns an object with:

- `isConnected` (boolean)
- `isRecording` (boolean)
- `transcription` (array): List of transcription messages.
- `providers` (array): List of available AI providers from the server.
- `selectProvider` (function): Function to switch providers.

## License

MIT
