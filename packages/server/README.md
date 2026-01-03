# @leia-org/luke-server

The server-side component of the Luke library, responsible for managing WebSocket connections, authentication, and orchestrating communication with AI providers (OpenAI Realtime, Gemini Live).

## Features

- **Unified Interface**: Abstract away differences between OpenAI and Gemini.
- **WebSocket Server**: Handles real-time audio and text streaming.
- **Authentication**: Built-in support for JWT and custom validation.
- **Session Management**: persistent sessions and database integration hooks.
- **Hybrid Recording**: Records sessions in MP3 (if ffmpeg available) or WAV, with automatic silence trimming.

## Installation

```bash
pnpm add @leia-org/luke-server
```

## Usage

```typescript
import { createLukeServer, openai, gemini } from '@leia-org/luke-server';

const server = createLukeServer({
  providers: [
    openai({ apiKey: process.env.OPENAI_API_KEY }),
    gemini({ apiKey: process.env.GEMINI_API_KEY }),
  ],
  // ... configuration
});

  console.log('Luke server running on port 3001');
});
```

## Recording Configuration

Luke can automatically record sessions. It prioritizes **MP3** (via `ffmpeg`) for storage efficiency but falls back to **WAV** if `ffmpeg` is not found.

```typescript
const server = createLukeServer({
  // ...
  recording: {
    enabled: true,
    directory: './recordings',
    // Supported variables: {id}, {timestamp}, X (random char), N (random number)
    filenameTemplate: 'session_{id}_{timestamp}', 
  }
});
```
*Note: MP3 recording requires `ffmpeg` to be installed and available in the system PATH. It automatically applies filters to remove long periods of silence (>1s) and normalizes audio rate to 24kHz.*

## Configuration

The `createLukeServer` function accepts a configuration object with the following properties:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `providers` | `LukeProvider[]` | Yes | Array of initialized provider instances (e.g., `openai({...})`, `gemini({...})`). |
| `auth` | `AuthConfig` | Yes | Configuration for authentication. |
| `auth.jwt` | `JwtConfig` | No | JWT verification settings (`secret`, `algorithms`). |
| `auth.validate` | `Function` | Yes | Callback to validate decoded token and return user object. |
| `session` | `SessionConfig` | No | Hooks for session lifecycle management. |
| `session.create` | `Function` | No | Called when a new session is established. |
| `session.onEnd` | `Function` | No | Called when a session ends (disconnect, error, timeout). |
| `config` | `ProviderSessionConfig` | No | Default configuration for provider sessions. |
| `config.systemInstruction` | `string` | No | System prompt for the AI model. |
| `config.tools` | `ToolDefinition[]` | No | Tools available to the model. |
| `onConnect` | `Function` | No | Callback when a client successfully connects. |
| `onDisconnect` | `Function` | No | Callback when a client disconnects. |
| `onTranscription` | `Function` | No | Callback for real-time transcription events. |

