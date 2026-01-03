// @luke/server - Unified Realtime AI Server
// Main entry point and public exports

export { createLukeServer } from './server/ws-server.js';
export type { LukeServerInstance } from './server/ws-server.js';

export { openai } from './providers/openai.js';
export { gemini } from './providers/gemini.js';

export type {
    // Provider types
    LukeProvider,
    ProviderConnection,
    ProviderSessionConfig,
    VoiceConfig,

    // Server configuration
    LukeServerConfig,
    AuthConfig,
    JwtConfig,
    SessionConfig,

    // Session types
    LukeSession,
    Transcription,

    // Tool definition
    ToolDefinition,

    // Message types
    ClientMessage,
    ServerMessage,
    HandshakeMessage,
} from './types.js';

// Re-export zod for tool parameter definitions
export { z } from 'zod';
