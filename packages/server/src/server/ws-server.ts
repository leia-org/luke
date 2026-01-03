// WebSocket Server
// Main server that handles client connections, authentication, and provider routing

import { createServer, type Server as HttpServer, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticate } from './auth.js';
import type {
    LukeServerConfig,
    LukeSession,
    LukeProvider,
    ProviderConnection,
    ClientMessage,
    ServerMessage,
    HandshakeMessage,
    Transcription,
} from '../types.js';

// Generates a unique session ID
function generateSessionId(): string {
    return `luke_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Creates the Luke WebSocket server
export function createLukeServer<TUser, TSession>(
    config: LukeServerConfig<TUser, TSession>
): LukeServerInstance {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });

    // Track active sessions by connection
    const sessions = new Map<WebSocket, LukeSession<TSession>>();
    const users = new Map<WebSocket, TUser>();

    // Handle WebSocket upgrade with auth
    httpServer.on('upgrade', async (req, socket, head) => {
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

            case 'audio':
                if (session.providerConnection) {
                    session.providerConnection.send({
                        type: 'audio',
                        data: new Uint8Array(message.data),
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
            const connection = await provider.connect({
                voice: voiceId ?? provider.voices[0]?.id,
                systemInstruction: config.config?.systemInstruction,
                transcription: config.config?.transcription,
                tools: config.config?.tools,
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
        session: LukeSession<TSession>
    ): void {
        connection.onAudio((audio) => {
            if (ws.readyState === WebSocket.OPEN) {
                // Send audio as binary frame
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

            // Call transcription callback
            config.onTranscription?.(transcription, session);
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

        sessions.delete(ws);
        users.delete(ws);
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
            httpServer.listen(port, callback);
        },

        close(): Promise<void> {
            return new Promise((resolve) => {
                wss.close(() => {
                    httpServer.close(() => resolve());
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
