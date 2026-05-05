// @luke/server - Unified Realtime AI Server
// Main entry point and public exports
export { createLukeServer } from './server/ws-server.js';
export { openai } from './providers/openai.js';
export { gemini } from './providers/gemini.js';
// Re-export zod for tool parameter definitions
export { z } from 'zod';
// Helper that infers the execute signature from the zod schema so users
// get type-safe tool authoring without repeating the parameter shape.
export function defineTool(tool) {
    return tool;
}
//# sourceMappingURL=index.js.map