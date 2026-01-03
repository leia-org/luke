# @luke/server

The server-side component of the Luke library, responsible for managing WebSocket connections, authentication, and orchestrating communication with AI providers (OpenAI Realtime, Gemini Live).

## Features

- **Unified Interface**: Abstract away differences between OpenAI and Gemini.
- **WebSocket Server**: Handles real-time audio and text streaming.
- **Authentication**: Built-in support for JWT and custom validation.
- **Session Management**: persistent sessions and database integration hooks.

## Installation

```bash
pnpm add @luke/server
```

## Usage

```typescript
import { createLukeServer, openai, gemini } from '@luke/server';

const server = createLukeServer({
  providers: [
    openai({ apiKey: process.env.OPENAI_API_KEY }),
    gemini({ apiKey: process.env.GEMINI_API_KEY }),
  ],
  // ... configuration
});

server.listen(3001, () => {
  console.log('Luke server running on port 3001');
});
```

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

