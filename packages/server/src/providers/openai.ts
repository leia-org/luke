// OpenAI Realtime Provider
// Connects to OpenAI's Realtime API via WebSocket

import WebSocket from 'ws';
import type {
    LukeProvider,
    ProviderConnection,
    ProviderSessionConfig,
    ProviderMessage,
    Transcription,
    VoiceConfig,
} from '../types.js';

interface OpenAIProviderOptions {
    apiKey: string;
    model?: string;
}

// Available voices for OpenAI Realtime
const OPENAI_VOICES: VoiceConfig[] = [
    { id: 'alloy', name: 'Alloy' },
    { id: 'echo', name: 'Echo' },
    { id: 'fable', name: 'Fable' },
    { id: 'onyx', name: 'Onyx' },
    { id: 'nova', name: 'Nova' },
    { id: 'shimmer', name: 'Shimmer' },
];

// Creates an OpenAI Realtime provider instance
export function openai(options: OpenAIProviderOptions): LukeProvider {
    const model = options.model ?? 'gpt-realtime-2025-08-28';

    return {
        id: 'openai',
        name: 'openai',
        sampleRate: 24000,
        voices: OPENAI_VOICES,

        async connect(config: ProviderSessionConfig): Promise<ProviderConnection> {
            return createOpenAIConnection(options.apiKey, model, config);
        },
    };
}

// Manages the WebSocket connection to OpenAI Realtime API
async function createOpenAIConnection(
    apiKey: string,
    model: string,
    config: ProviderSessionConfig
): Promise<ProviderConnection> {
    const url = `wss://api.openai.com/v1/realtime?model=${model}`;

    const ws = new WebSocket(url, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'OpenAI-Beta': 'realtime=v1',
        },
    });

    // Event handlers set by the caller
    let onAudioHandler: ((audio: Uint8Array) => void) | null = null;
    let onTranscriptionHandler: ((t: Transcription) => void) | null = null;
    let onTurnCompleteHandler: (() => void) | null = null;
    let onInterruptedHandler: (() => void) | null = null;
    let onErrorHandler: ((error: Error) => void) | null = null;

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
            // Send session configuration
            const sessionConfig: Record<string, unknown> = {
                modalities: ['audio', 'text'],
                voice: config.voice ?? 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                turn_detection: { type: 'server_vad' },
            };

            if (config.systemInstruction) {
                sessionConfig.instructions = config.systemInstruction;
            }

            if (config.transcription?.input) {
                sessionConfig.input_audio_transcription = { model: 'whisper-1' };
            }

            // Map tools to OpenAI format
            if (config.tools && config.tools.length > 0) {
                sessionConfig.tools = config.tools.map((tool) => ({
                    type: 'function',
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                }));
            }

            ws.send(JSON.stringify({
                type: 'session.update',
                session: sessionConfig,
            }));

            // Inject conversation history for provider hot-swap
            if (config.history && config.history.length > 0) {
                for (const msg of config.history) {
                    ws.send(JSON.stringify({
                        type: 'conversation.item.create',
                        item: {
                            type: 'message',
                            role: msg.role === 'assistant' ? 'assistant' : 'user',
                            content: [{
                                type: msg.role === 'assistant' ? 'text' : 'input_text',
                                text: msg.text,
                            }],
                        },
                    }));
                }
            }

            resolve();
        });

        ws.on('error', reject);
    });

    // Handle incoming messages from OpenAI
    ws.on('message', (data: Buffer) => {
        try {
            const message = JSON.parse(data.toString());
            handleOpenAIMessage(message);
        } catch (err) {
            onErrorHandler?.(err instanceof Error ? err : new Error(String(err)));
        }
    });

    function handleOpenAIMessage(message: Record<string, unknown>) {
        switch (message.type) {
            case 'response.audio.delta': {
                // Audio chunk received
                const audioB64 = message.delta as string;
                const audioBytes = Buffer.from(audioB64, 'base64');
                onAudioHandler?.(new Uint8Array(audioBytes));
                break;
            }

            case 'conversation.item.input_audio_transcription.completed': {
                // User speech transcription
                const transcript = message.transcript as string;
                onTranscriptionHandler?.({
                    role: 'user',
                    text: transcript,
                    final: true,
                });
                break;
            }

            case 'response.audio_transcript.delta': {
                // Assistant speech transcription (streaming)
                const delta = message.delta as string;
                onTranscriptionHandler?.({
                    role: 'assistant',
                    text: delta,
                    final: false,
                });
                break;
            }

            case 'response.audio_transcript.done': {
                // Assistant transcription complete
                const transcript = message.transcript as string;
                onTranscriptionHandler?.({
                    role: 'assistant',
                    text: transcript,
                    final: true,
                });
                break;
            }

            case 'response.done': {
                onTurnCompleteHandler?.();
                break;
            }

            case 'input_audio_buffer.speech_started': {
                // User started speaking, interrupt if needed
                onInterruptedHandler?.();
                break;
            }

            case 'error': {
                const errorMsg = (message.error as Record<string, unknown>)?.message || 'Unknown error';
                onErrorHandler?.(new Error(String(errorMsg)));
                break;
            }
        }
    }

    ws.on('close', () => {
        onErrorHandler?.(new Error('WebSocket connection closed'));
    });

    return {
        send(message: ProviderMessage): void {
            if (ws.readyState !== WebSocket.OPEN) return;

            if (message.type === 'audio') {
                // Send audio as base64 encoded PCM
                const audioB64 = Buffer.from(message.data).toString('base64');
                ws.send(JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: audioB64,
                }));
            } else if (message.type === 'text') {
                // Send text input
                ws.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [{ type: 'input_text', text: message.content }],
                    },
                }));
                ws.send(JSON.stringify({ type: 'response.create' }));
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
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'response.cancel' }));
            }
        },

        async disconnect() {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        },
    };
}
