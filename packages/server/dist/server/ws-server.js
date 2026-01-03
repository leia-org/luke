// WebSocket Server
// Main server that handles client connections, authentication, and provider routing
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import { authenticate } from './auth.js';
import { SessionRecorder } from './recorder.js';
// Generates a unique session ID
function generateSessionId() {
    return `luke_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
// Creates the Luke WebSocket server
export function createLukeServer(config) {
    const httpServer = createServer();
    const wss = new WebSocketServer({ noServer: true });
    // Track active sessions by connection
    const sessions = new Map();
    const users = new Map();
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
        }
        catch (err) {
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
            socket.destroy();
        }
    });
    // Encryption helpers
    const encryptString = (text, key) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    };
    const decryptString = (text, key) => {
        const [ivHex, authTagHex, encryptedHex] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    };
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
        // Initialize session state
        const session = {
            id: generateSessionId(),
            providerId: '',
            providerConnection: null,
            userSession: null,
            createdAt: new Date(),
        };
        sessions.set(ws, session);
        // Initialize recorder if enabled
        if (config.recording?.enabled) {
            session.recorder = new SessionRecorder(session.id, config.recording.directory, config.recording.filenameTemplate);
            session.recorder.start();
        }
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
                // Record user audio
                // Use provider's sample rate if available (client sends what provider requested)
                // Default to 16000 if no provider selected yet
                if (session.recorder) {
                    let inputRate = 16000;
                    if (session.providerId) {
                        const provider = config.providers.find(p => p.id === session.providerId);
                        if (provider) {
                            inputRate = provider.sampleRate;
                        }
                    }
                    // Ensure we slice the buffer correctly to avoid garbage
                    const audioBuffer = Buffer.from(message.data);
                    // Double check if message.data is ArrayBuffer, duplicate it to ensure clean memory
                    // (Buffer.from(arrayBuffer) usually does a copy but let's be safe)
                    session.recorder.writeAudio(audioBuffer, inputRate);
                }
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
            const readyMsg = {
                type: 'session_ready',
                sessionId: session.id,
                sampleRate: provider.sampleRate,
            };
            ws.send(JSON.stringify(readyMsg));
            // Load and send history if available
            if (config.session?.getHistory && session.userSession) {
                try {
                    const history = await config.session.getHistory(session.userSession);
                    if (history && history.length > 0) {
                        // Decrypt if needed
                        const processedHistory = history.map(msg => {
                            if (config.security?.encryptionKey) {
                                try {
                                    return { ...msg, text: decryptString(msg.text, config.security.encryptionKey) };
                                }
                                catch (e) {
                                    console.error('Failed to decrypt message:', e);
                                    return { ...msg, text: '[Encrypted Message]' };
                                }
                            }
                            return msg;
                        });
                        ws.send(JSON.stringify({
                            type: 'history',
                            messages: processedHistory
                        }));
                    }
                }
                catch (err) {
                    console.error('Failed to load history:', err);
                }
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
                // Record assistant audio (usually 24kHz)
                if (session.recorder) {
                    // Safe buffer creation with offset/length
                    const audioBuffer = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
                    session.recorder.writeAudio(audioBuffer, 24000);
                }
                // Send audio as binary frame
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
            // Call transcription callback
            config.onTranscription?.(transcription, session);
            // Save history (only final messages)
            if (config.session?.saveHistory && session.userSession && transcription.final) {
                // Encrypt if needed
                let msgToSave = transcription;
                if (config.security?.encryptionKey) {
                    msgToSave = {
                        ...transcription,
                        text: encryptString(transcription.text, config.security.encryptionKey)
                    };
                }
                config.session.saveHistory(session.userSession, msgToSave).catch(err => {
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
        // Stop recorder
        if (session.recorder) {
            session.recorder.stop();
        }
        sessions.delete(ws);
        users.delete(ws);
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
            httpServer.listen(port, callback);
        },
        close() {
            return new Promise((resolve) => {
                wss.close(() => {
                    httpServer.close(() => resolve());
                });
            });
        },
        get httpServer() {
            return httpServer;
        },
    };
}
//# sourceMappingURL=ws-server.js.map