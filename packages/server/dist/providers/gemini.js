// Gemini Live Provider
// Connects to Google's Gemini Live API via WebSocket
import WebSocket from 'ws';
// Gemini uses speechConfig for voice selection
const GEMINI_VOICES = [
    { id: 'Puck', name: 'Puck' },
    { id: 'Charon', name: 'Charon' },
    { id: 'Kore', name: 'Kore' },
    { id: 'Fenrir', name: 'Fenrir' },
    { id: 'Aoede', name: 'Aoede' },
];
// Creates a Gemini Live provider instance
export function gemini(options) {
    const model = options.model ?? 'gemini-2.5-flash-native-audio-preview-12-2025';
    return {
        id: 'gemini',
        name: 'gemini',
        sampleRate: 16000, // Input sample rate
        voices: GEMINI_VOICES,
        async connect(config) {
            return createGeminiConnection(options.apiKey, model, config);
        },
    };
}
// Manages the WebSocket connection to Gemini Live API
async function createGeminiConnection(apiKey, model, config) {
    // Gemini Live API WebSocket URL (v1beta per documentation)
    const baseUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
    const url = `${baseUrl}?key=${apiKey}`;
    const ws = new WebSocket(url);
    // Event handlers
    let onAudioHandler = null;
    let onTranscriptionHandler = null;
    let onTurnCompleteHandler = null;
    let onInterruptedHandler = null;
    let onErrorHandler = null;
    // Wait for connection and send setup
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
        ws.on('open', () => {
            // Build setup message per API spec
            const setup = {
                model: `models/${model}`,
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: config.voice ?? 'Puck',
                            },
                        },
                    },
                },
            };
            // Add system instruction if provided
            if (config.systemInstruction) {
                setup.systemInstruction = {
                    parts: [{ text: config.systemInstruction }],
                };
            }
            // Add transcription config
            if (config.transcription?.input) {
                setup.inputAudioTranscription = {};
            }
            if (config.transcription?.output) {
                setup.outputAudioTranscription = {};
            }
            ws.send(JSON.stringify({ setup }));
        });
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                // Wait for setupComplete before resolving
                if (message.setupComplete !== undefined) {
                    clearTimeout(timeout);
                    resolve();
                }
            }
            catch (err) {
                // Ignore parse errors during setup
            }
        });
        ws.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });
        ws.on('close', (code, reason) => {
            clearTimeout(timeout);
            reject(new Error(`WebSocket closed: ${code}`));
        });
    });
    // Handle incoming messages after setup
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleGeminiMessage(message);
        }
        catch (err) {
            onErrorHandler?.(err instanceof Error ? err : new Error(String(err)));
        }
    });
    // Transcription buffers and tracking
    let inputTranscriptBuffer = '';
    let outputTranscriptBuffer = '';
    let lastSentInputText = '';
    let lastSentOutputText = '';
    function handleGeminiMessage(message) {
        const serverContent = message.serverContent;
        if (serverContent) {
            // Handle audio from model turn
            const modelTurn = serverContent.modelTurn;
            if (modelTurn?.parts) {
                const parts = modelTurn.parts;
                for (const part of parts) {
                    if (part.inlineData) {
                        const inlineData = part.inlineData;
                        const audioB64 = inlineData.data;
                        if (audioB64) {
                            const audioBytes = Buffer.from(audioB64, 'base64');
                            onAudioHandler?.(new Uint8Array(audioBytes));
                        }
                    }
                }
            }
            // Handle input transcription (user speech)
            const inputTranscription = serverContent.inputTranscription;
            if (inputTranscription?.text) {
                inputTranscriptBuffer += inputTranscription.text;
                // Send as partial
                onTranscriptionHandler?.({
                    role: 'user',
                    text: inputTranscriptBuffer,
                    final: false,
                });
                lastSentInputText = inputTranscriptBuffer;
            }
            // Handle output transcription (assistant speech)
            const outputTranscription = serverContent.outputTranscription;
            if (outputTranscription?.text) {
                // If we were accumulating user input and assistant starts speaking,
                // finalize the user message now (before adding assistant text)
                if (inputTranscriptBuffer && inputTranscriptBuffer !== '') {
                    onTranscriptionHandler?.({
                        role: 'user',
                        text: inputTranscriptBuffer,
                        final: true,
                    });
                    inputTranscriptBuffer = ''; // Clear so we don't re-send
                }
                outputTranscriptBuffer += outputTranscription.text;
                onTranscriptionHandler?.({
                    role: 'assistant',
                    text: outputTranscriptBuffer,
                    final: false,
                });
                lastSentOutputText = outputTranscriptBuffer;
            }
            // Check for turn completion
            if (serverContent.turnComplete) {
                // Finalize any remaining transcriptions that weren't already finalized
                if (inputTranscriptBuffer && inputTranscriptBuffer !== '') {
                    onTranscriptionHandler?.({
                        role: 'user',
                        text: inputTranscriptBuffer,
                        final: true,
                    });
                    inputTranscriptBuffer = '';
                }
                if (outputTranscriptBuffer && outputTranscriptBuffer !== '') {
                    onTranscriptionHandler?.({
                        role: 'assistant',
                        text: outputTranscriptBuffer,
                        final: true,
                    });
                    outputTranscriptBuffer = '';
                }
                onTurnCompleteHandler?.();
            }
            // Check for interruption
            if (serverContent.interrupted) {
                // Clear buffers on interruption
                inputTranscriptBuffer = '';
                outputTranscriptBuffer = '';
                onInterruptedHandler?.();
            }
        }
        // Handle Go Away (session ending soon)
        if (message.goAway) {
            onErrorHandler?.(new Error('Server requested disconnect'));
        }
    }
    ws.on('close', () => {
        onErrorHandler?.(new Error('WebSocket connection closed'));
    });
    return {
        send(message) {
            if (ws.readyState !== WebSocket.OPEN)
                return;
            if (message.type === 'audio') {
                // Send audio using the new format per documentation
                const audioB64 = Buffer.from(message.data).toString('base64');
                ws.send(JSON.stringify({
                    realtimeInput: {
                        audio: {
                            data: audioB64,
                            mimeType: 'audio/pcm;rate=16000',
                        },
                    },
                }));
            }
            else if (message.type === 'text') {
                // Send text as client content
                ws.send(JSON.stringify({
                    clientContent: {
                        turns: [
                            {
                                role: 'user',
                                parts: [{ text: message.content }],
                            },
                        ],
                        turnComplete: true,
                    },
                }));
            }
        },
        onAudio(handler) {
            onAudioHandler = handler;
        },
        onTranscription(handler) {
            onTranscriptionHandler = handler;
        },
        onTurnComplete(handler) {
            onTurnCompleteHandler = handler;
        },
        onInterrupted(handler) {
            onInterruptedHandler = handler;
        },
        onError(handler) {
            onErrorHandler = handler;
        },
        interrupt() {
            // Signal end of audio stream
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    realtimeInput: {
                        audioStreamEnd: true,
                    },
                }));
            }
        },
        async disconnect() {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        },
    };
}
//# sourceMappingURL=gemini.js.map