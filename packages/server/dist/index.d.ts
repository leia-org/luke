export { createLukeServer } from './server/ws-server.js';
export type { LukeServerInstance } from './server/ws-server.js';
export { openai } from './providers/openai.js';
export { gemini } from './providers/gemini.js';
export type { LukeProvider, ProviderConnection, ProviderSessionConfig, VoiceConfig, LukeServerConfig, AuthConfig, JwtConfig, SessionConfig, LukeSession, Transcription, ToolDefinition, ClientMessage, ServerMessage, HandshakeMessage, } from './types.js';
export { z } from 'zod';
import type { z as zType } from 'zod';
import type { ToolDefinition } from './types.js';
export declare function defineTool<T extends zType.ZodType>(tool: {
    name: string;
    description: string;
    parameters: T;
    execute: (params: zType.infer<T>) => Promise<unknown> | unknown;
}): ToolDefinition;
//# sourceMappingURL=index.d.ts.map