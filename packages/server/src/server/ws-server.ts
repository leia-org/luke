// WebSocket Server
// Main server that handles client connections, authentication, and provider routing

import { createServer, type Server as HttpServer, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate } from './auth.js';
import type {
    LukeServerConfig,
    LukeSession,
    LukeProvider,
    ProviderConnection,
    ProviderToolDeclaration,
    ClientMessage,
    ServerMessage,
    HandshakeMessage,
    FrontendToolSchema,
    ToolDefinition,
    Transcription,
} from '../types.js';

// Timeout (ms) for a frontend tool call to return a result before we
// reply to the provider with an error.
const FRONTEND_TOOL_TIMEOUT_MS = 10000;

// Per-session tool registry. Each entry tells us how to dispatch when a
// provider emits a call with that name.
type ToolEntry =
    | { kind: 'backend'; def: ToolDefinition }
    | { kind: 'frontend' };

interface PendingFrontendCall {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
}

// Strip JSON-Schema meta fields that Gemini Live rejects (it closes
// the socket with 1007 otherwise). $schema and additionalProperties
// are the usual offenders emitted by zod-to-json-schema.
function sanitizeJsonSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(sanitizeJsonSchema);
    if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (k === '$schema' || k === 'additionalProperties' || k === '$ref' || k === 'definitions') continue;
            out[k] = sanitizeJsonSchema(v);
        }
        return out;
    }
    return node;
}

// Generates a unique session ID
function generateSessionId(): string {
    return `luke_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Creates the Luke WebSocket server
export function createLukeServer<TUser, TSession>(
    config: LukeServerConfig<TUser, TSession>
): LukeServerInstance {
    const isExternal = !!config.server;
    const httpServer = config.server ?? createServer();
    const wsPath = config.path ?? '/';
    const wss = new WebSocketServer({ noServer: true });

    // Track active sessions by connection
    const sessions = new Map<WebSocket, LukeSession<TSession>>();
    const users = new Map<WebSocket, TUser>();
    // In-memory conversation history per connection (for provider hot-swap)
    const conversationHistory = new Map<WebSocket, Transcription[]>();
    // Per-connection audio input sample rate advertised by the client via
    // the `client_audio_format` message. Defaults to 48000 if never sent.
    const clientSampleRates = new Map<WebSocket, number>();
    // Frontend tool schemas registered by each client (before select_provider).
    const frontendSchemas = new Map<WebSocket, FrontendToolSchema[]>();
    // Dispatch map: tool name → how to execute it.
    const toolRegistry = new Map<WebSocket, Map<string, ToolEntry>>();
    // Pending frontend tool calls awaiting a tool_result from the client.
    const pendingFrontendCalls = new Map<WebSocket, Map<string, PendingFrontendCall>>();

    // Linear-interpolation resample of a PCM16 LE mono buffer.
    function resamplePcm16(input: Buffer, fromRate: number, toRate: number): Buffer {
        if (fromRate === toRate) return input;
        const inSamples = input.length / 2;
        const ratio = fromRate / toRate;
        const outSamples = Math.floor(inSamples / ratio);
        const out = Buffer.alloc(outSamples * 2);
        for (let i = 0; i < outSamples; i++) {
            const srcPos = i * ratio;
            const idx0 = Math.floor(srcPos);
            const idx1 = Math.min(idx0 + 1, inSamples - 1);
            const frac = srcPos - idx0;
            const s0 = input.readInt16LE(idx0 * 2);
            const s1 = input.readInt16LE(idx1 * 2);
            const sample = Math.round(s0 * (1 - frac) + s1 * frac);
            out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
        }
        return out;
    }

    // Handle WebSocket upgrade with auth
    httpServer.on('upgrade', async (req, socket, head) => {
        // Filter by path when sharing an HTTP server
        const reqPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
        if (!reqPath.startsWith(wsPath)) return;

        try {
            const user = await authenticate(req, config.auth);
            if (!user) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(req, socket, head, (ws) => {
                users.set(ws, user);
                wss.emit('connection', ws, req, user);
            });
        } catch (err) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
    });

    wss.on('connection', async (ws: WebSocket, req: IncomingMessage, user: TUser) => {

        // Send handshake with available providers
        const handshake: HandshakeMessage = {
            type: 'handshake',
            providers: config.providers.map((p) => ({
                id: p.id,
                name: p.name,
                sampleRate: p.sampleRate,
                voices: p.voices,
            })),
            defaultProvider: config.providers[0]?.id,
        };
        ws.send(JSON.stringify(handshake));

        // Initialize session state
        const session: LukeSession<TSession> = {
            id: generateSessionId(),
            providerId: '',
            providerConnection: null,
            userSession: null,
            createdAt: new Date(),
        };
        sessions.set(ws, session);
        conversationHistory.set(ws, []);

        // Handle incoming messages
        ws.on('message', async (data) => {
            try {
                const message = parseClientMessage(data);
                if (!message) return;

                await handleClientMessage(ws, message, session, user);
            } catch (err) {
                sendError(ws, 'MESSAGE_ERROR', err instanceof Error ? err.message : 'Unknown error');
            }
        });

        ws.on('close', async () => {
            await cleanupSession(ws, session, user, 'disconnect');
        });

        ws.on('error', async (err) => {
            await cleanupSession(ws, session, user, 'error');
        });
    });

    // Parse raw message data into ClientMessage
    function parseClientMessage(data: unknown): ClientMessage | null {
        // Convert to string if Buffer
        let stringData: string | null = null;

        if (data instanceof Buffer) {
            // Try to parse as JSON first (text messages come as Buffer too)
            try {
                stringData = data.toString('utf-8');
                // Check if it looks like JSON
                if (stringData.startsWith('{') || stringData.startsWith('[')) {
                    const parsed = JSON.parse(stringData) as ClientMessage;
                    return parsed;
                }
            } catch {
                // Not JSON, treat as binary audio
            }

            // Binary audio data
            return { type: 'audio', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
        }

        // String data
        if (typeof data === 'string') {
            try {
                return JSON.parse(data) as ClientMessage;
            } catch {
                return null;
            }
        }

        return null;
    }

    // Handle different client message types
    async function handleClientMessage(
        ws: WebSocket,
        message: ClientMessage,
        session: LukeSession<TSession>,
        user: TUser
    ): Promise<void> {
        switch (message.type) {
            case 'select_provider':
                await handleSelectProvider(ws, message.providerId, message.voiceId, session, user);
                break;

            case 'client_audio_format':
                clientSampleRates.set(ws, message.sampleRate);
                break;

            case 'audio':
                if (session.providerConnection) {
                    const fromRate = clientSampleRates.get(ws) ?? 48000;
                    const provider = config.providers.find((p) => p.id === session.providerId);
                    const toRate = provider?.sampleRate ?? fromRate;
                    const inputBuf = Buffer.from(
                        message.data,
                        0,
                        message.data.byteLength
                    );
                    const resampled = resamplePcm16(inputBuf, fromRate, toRate);
                    session.providerConnection.send({
                        type: 'audio',
                        data: new Uint8Array(resampled.buffer, resampled.byteOffset, resampled.byteLength),
                    });
                }
                break;

            case 'text':
                if (session.providerConnection) {
                    session.providerConnection.send({
                        type: 'text',
                        content: message.content,
                    });
                }
                break;

            case 'interrupt':
                session.providerConnection?.interrupt();
                break;

            case 'reconnect':
                // Attempt to resume previous session
                if (config.session?.resolve) {
                    const existing = await config.session.resolve(
                        { url: `/?sessionId=${message.sessionId}` } as IncomingMessage,
                        user
                    );
                    if (existing) {
                        session.userSession = existing;
                    }
                }
                break;

            case 'register_tools':
                // Store schemas for the upcoming select_provider. The
                // client must send this before select_provider for the
                // tools to be declared to the LLM.
                frontendSchemas.set(ws, message.tools ?? []);
                break;

            case 'tool_result': {
                const pending = pendingFrontendCalls.get(ws)?.get(message.callId);
                if (!pending) break;
                pendingFrontendCalls.get(ws)?.delete(message.callId);
                clearTimeout(pending.timer);
                if (message.error) {
                    pending.reject(new Error(message.error));
                } else {
                    pending.resolve(message.result);
                }
                break;
            }
        }
    }

    // Connect to selected provider
    async function handleSelectProvider(
        ws: WebSocket,
        providerId: string,
        voiceId: string | undefined,
        session: LukeSession<TSession>,
        user: TUser
    ): Promise<void> {
        // Find the requested provider
        const provider = config.providers.find((p) => p.id === providerId);
        if (!provider) {
            sendError(ws, 'INVALID_PROVIDER', `Provider ${providerId} not found`);
            return;
        }

        // Disconnect existing provider connection if any
        if (session.providerConnection) {
            // Store reference and clear it before disconnecting
            // This prevents the error handler from firing and confusing the client
            const oldConnection = session.providerConnection;
            session.providerConnection = null;
            await oldConnection.disconnect();
        }

        // Create or resolve user session
        if (config.session?.create && !session.userSession) {
            session.userSession = await config.session.create(user, provider);
        }

        // Connect to the provider
        try {
            // Resolve per-session systemInstruction
            const systemInstruction = session.userSession && config.session?.getSystemInstruction
                ? await config.session.getSystemInstruction(session.userSession)
                : undefined;

            // On reconnect, seed in-memory history from persisted history
            const localHistory = conversationHistory.get(ws) || [];
            let persistedHistory: Transcription[] = [];

            if (config.session?.getHistory && session.userSession) {
                try {
                    persistedHistory = await config.session.getHistory(session.userSession) || [];
                } catch (err) {
                    console.error('Failed to load history:', err);
                }
            }

            // If local history is empty but persisted exists, this is a reconnect
            if (localHistory.length === 0 && persistedHistory.length > 0) {
                conversationHistory.set(ws, [...persistedHistory]);
            }

            // Build unified tool declarations (backend + frontend)
            // and a per-session dispatch registry.
            const backendTools = config.tools ?? [];
            const frontendTools = frontendSchemas.get(ws) ?? [];
            const declarations: ProviderToolDeclaration[] = [
                ...backendTools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: sanitizeJsonSchema(zodToJsonSchema(t.parameters, { target: 'openAi' })) as Record<string, unknown>,
                })),
                ...frontendTools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: sanitizeJsonSchema(t.parameters) as Record<string, unknown>,
                })),
            ];
            const registry = new Map<string, ToolEntry>();
            for (const t of backendTools) registry.set(t.name, { kind: 'backend', def: t });
            for (const t of frontendTools) registry.set(t.name, { kind: 'frontend' });
            toolRegistry.set(ws, registry);
            pendingFrontendCalls.set(ws, new Map());

            const connection = await provider.connect({
                voice: voiceId ?? provider.voices[0]?.id,
                systemInstruction,
                history: conversationHistory.get(ws) || [],
                transcription: config.config?.transcription,
                tools: declarations.length > 0 ? declarations : undefined,
            });

            session.providerId = providerId;
            session.providerConnection = connection;

            // Wire up provider events to client
            setupProviderHandlers(ws, connection, session);

            // Notify client that session is ready
            const readyMsg: ServerMessage = {
                type: 'session_ready',
                sessionId: session.id,
                sampleRate: provider.sampleRate,
            };
            ws.send(JSON.stringify(readyMsg));

            // Send persisted history to client for UI display
            if (persistedHistory.length > 0) {
                ws.send(JSON.stringify({
                    type: 'history',
                    messages: persistedHistory,
                }));
            }

            // Trigger onConnect callback
            config.onConnect?.(session, user);
        } catch (err) {
            sendError(ws, 'PROVIDER_ERROR', err instanceof Error ? err.message : 'Connection failed');
        }
    }

    // Set up event handlers from provider to client
    function setupProviderHandlers(
        ws: WebSocket,
        connection: ProviderConnection,
        session: LukeSession<TSession>,
    ): void {
        connection.onAudio((audio) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(audio);
            }
        });

        connection.onTranscription((transcription: Transcription) => {
            if (ws.readyState === WebSocket.OPEN) {
                const msg: ServerMessage = {
                    type: 'transcription',
                    role: transcription.role,
                    text: transcription.text,
                    final: transcription.final,
                };
                ws.send(JSON.stringify(msg));
            }

            // Track final transcriptions for provider hot-swap
            if (transcription.final) {
                conversationHistory.get(ws)?.push(transcription);
            }

            // Call transcription callback
            config.onTranscription?.(transcription, session);

            // Save history (only final messages)
            if (config.session?.saveHistory && session.userSession && transcription.final) {
                config.session.saveHistory(session.userSession, transcription).catch(err => {
                    console.error('Failed to save history:', err);
                });
            }
        });

        connection.onTurnComplete(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'turn_complete' }));
            }
        });

        connection.onInterrupted(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'interrupted' }));
            }
        });

        connection.onToolCall(async (call) => {
            const registry = toolRegistry.get(ws);
            const entry = registry?.get(call.name);
            if (!entry) {
                connection.sendToolResult(call.callId, { error: `Unknown tool: ${call.name}` });
                return;
            }
            try {
                if (entry.kind === 'backend') {
                    // Validate args with the tool's zod schema (throws on mismatch)
                    const parsed = entry.def.parameters.parse(call.arguments);
                    const result = await entry.def.execute(parsed);
                    connection.sendToolResult(call.callId, result);
                } else {
                    // Frontend tool: forward to client and wait for result.
                    const result = await new Promise<unknown>((resolve, reject) => {
                        const pendings = pendingFrontendCalls.get(ws);
                        if (!pendings) {
                            reject(new Error('Session not ready for tool calls'));
                            return;
                        }
                        const timer = setTimeout(() => {
                            pendings.delete(call.callId);
                            reject(new Error(`Frontend tool '${call.name}' timed out after ${FRONTEND_TOOL_TIMEOUT_MS}ms`));
                        }, FRONTEND_TOOL_TIMEOUT_MS);
                        pendings.set(call.callId, { resolve, reject, timer });
                        if (ws.readyState === WebSocket.OPEN) {
                            const msg: ServerMessage = {
                                type: 'tool_call',
                                callId: call.callId,
                                name: call.name,
                                arguments: call.arguments,
                            };
                            ws.send(JSON.stringify(msg));
                        }
                    });
                    connection.sendToolResult(call.callId, result);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                connection.sendToolResult(call.callId, { error: message });
            }
        });

        connection.onError((error) => {
            // Only send error if this connection is still the active one
            // (prevents errors when switching providers)
            if (session.providerConnection === connection) {
                sendError(ws, 'PROVIDER_ERROR', error.message);
            }
        });
    }

    // Clean up when client disconnects
    async function cleanupSession(
        ws: WebSocket,
        session: LukeSession<TSession>,
        user: TUser,
        reason: 'disconnect' | 'error' | 'timeout'
    ): Promise<void> {
        if (session.providerConnection) {
            await session.providerConnection.disconnect();
        }

        if (config.session?.onEnd && session.userSession) {
            await config.session.onEnd(session.userSession, reason);
        }

        config.onDisconnect?.(session, user);

        // Reject any pending frontend tool calls for this connection
        const pendings = pendingFrontendCalls.get(ws);
        if (pendings) {
            for (const p of pendings.values()) {
                clearTimeout(p.timer);
                p.reject(new Error('Client disconnected'));
            }
        }

        sessions.delete(ws);
        users.delete(ws);
        conversationHistory.delete(ws);
        clientSampleRates.delete(ws);
        frontendSchemas.delete(ws);
        toolRegistry.delete(ws);
        pendingFrontendCalls.delete(ws);
    }

    // Send error message to client
    function sendError(ws: WebSocket, code: string, message: string): void {
        if (ws.readyState === WebSocket.OPEN) {
            const msg: ServerMessage = { type: 'error', code, message };
            ws.send(JSON.stringify(msg));
        }
    }

    return {
        listen(port: number, callback?: () => void): void {
            if (!isExternal) {
                httpServer.listen(port, callback);
            } else {
                callback?.();
            }
        },

        close(): Promise<void> {
            return new Promise((resolve) => {
                wss.close(() => {
                    if (!isExternal) {
                        httpServer.close(() => resolve());
                    } else {
                        resolve();
                    }
                });
            });
        },

        get httpServer(): HttpServer {
            return httpServer;
        },
    };
}

export interface LukeServerInstance {
    listen(port: number, callback?: () => void): void;
    close(): Promise<void>;
    readonly httpServer: HttpServer;
}
