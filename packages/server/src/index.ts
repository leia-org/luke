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
import type { z as zType } from 'zod';
import type { ToolDefinition } from './types.js';

// Helper that infers the execute signature from the zod schema so users
// get type-safe tool authoring without repeating the parameter shape.
export function defineTool<T extends zType.ZodType>(tool: {
    name: string;
    description: string;
    parameters: T;
    execute: (params: zType.infer<T>) => Promise<unknown> | unknown;
}): ToolDefinition {
    return tool as unknown as ToolDefinition;
}
