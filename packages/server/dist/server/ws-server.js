// WebSocket Server
// Main server that handles client connections, authentication, and provider routing
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { authenticate } from './auth.js';
// Generates a unique session ID
function generateSessionId() {
    return `luke_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
// Creates the Luke WebSocket server
export function createLukeServer(config) {
    const isExternal = !!config.server;
    const httpServer = config.server ?? createServer();
    const wsPath = config.path ?? '/';
    const wss = new WebSocketServer({ noServer: true });
    // Track active sessions by connection
    const sessions = new Map();
    const users = new Map();
    // In-memory conversation history per connection (for provider hot-swap)
    const conversationHistory = new Map();
    // Handle WebSocket upgrade with auth
    httpServer.on('upgrade', async (req, socket, head) => {
        // Filter by path when sharing an HTTP server
        const reqPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
        if (!reqPath.startsWith(wsPath))
            return;
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
        }
        catch (err) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
    });
    wss.on('connection', async (ws, req, user) => {
        // Send handshake with available providers
        const handshake = {
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
        const session = {
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
                if (!message)
                    return;
                await handleClientMessage(ws, message, session, user);
            }
            catch (err) {
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
    function parseClientMessage(data) {
        // Convert to string if Buffer
        let stringData = null;
        if (data instanceof Buffer) {
            // Try to parse as JSON first (text messages come as Buffer too)
            try {
                stringData = data.toString('utf-8');
                // Check if it looks like JSON
                if (stringData.startsWith('{') || stringData.startsWith('[')) {
                    const parsed = JSON.parse(stringData);
                    return parsed;
                }
            }
            catch {
                // Not JSON, treat as binary audio
            }
            // Binary audio data
            return { type: 'audio', data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
        }
        // String data
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            }
            catch {
                return null;
            }
        }
        return null;
    }
    // Handle different client message types
    async function handleClientMessage(ws, message, session, user) {
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
                    const existing = await config.session.resolve({ url: `/?sessionId=${message.sessionId}` }, user);
                    if (existing) {
                        session.userSession = existing;
                    }
                }
                break;
        }
    }
    // Connect to selected provider
    async function handleSelectProvider(ws, providerId, voiceId, session, user) {
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
            let persistedHistory = [];
            if (config.session?.getHistory && session.userSession) {
                try {
                    persistedHistory = await config.session.getHistory(session.userSession) || [];
                }
                catch (err) {
                    console.error('Failed to load history:', err);
                }
            }
            // If local history is empty but persisted exists, this is a reconnect
            if (localHistory.length === 0 && persistedHistory.length > 0) {
                conversationHistory.set(ws, [...persistedHistory]);
            }
            const connection = await provider.connect({
                voice: voiceId ?? provider.voices[0]?.id,
                systemInstruction,
                history: conversationHistory.get(ws) || [],
                transcription: config.config?.transcription,
                tools: config.config?.tools,
            });
            session.providerId = providerId;
            session.providerConnection = connection;
            // Wire up provider events to client
            setupProviderHandlers(ws, connection, session);
            // Notify client that session is ready
            const readyMsg = {
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
        }
        catch (err) {
            sendError(ws, 'PROVIDER_ERROR', err instanceof Error ? err.message : 'Connection failed');
        }
    }
    // Set up event handlers from provider to client
    function setupProviderHandlers(ws, connection, session) {
        connection.onAudio((audio) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(audio);
            }
        });
        connection.onTranscription((transcription) => {
            if (ws.readyState === WebSocket.OPEN) {
                const msg = {
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
        connection.onError((error) => {
            // Only send error if this connection is still the active one
            // (prevents errors when switching providers)
            if (session.providerConnection === connection) {
                sendError(ws, 'PROVIDER_ERROR', error.message);
            }
        });
    }
    // Clean up when client disconnects
    async function cleanupSession(ws, session, user, reason) {
        if (session.providerConnection) {
            await session.providerConnection.disconnect();
        }
        if (config.session?.onEnd && session.userSession) {
            await config.session.onEnd(session.userSession, reason);
        }
        config.onDisconnect?.(session, user);
        sessions.delete(ws);
        users.delete(ws);
        conversationHistory.delete(ws);
    }
    // Send error message to client
    function sendError(ws, code, message) {
        if (ws.readyState === WebSocket.OPEN) {
            const msg = { type: 'error', code, message };
            ws.send(JSON.stringify(msg));
        }
    }
    return {
        listen(port, callback) {
            if (!isExternal) {
                httpServer.listen(port, callback);
            }
            else {
                callback?.();
            }
        },
        close() {
            return new Promise((resolve) => {
                wss.close(() => {
                    if (!isExternal) {
                        httpServer.close(() => resolve());
                    }
                    else {
                        resolve();
                    }
                });
            });
        },
        get httpServer() {
            return httpServer;
        },
    };
}
//# sourceMappingURL=ws-server.js.map