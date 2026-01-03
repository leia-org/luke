// useLuke Hook
// Main React hook for realtime AI voice communication

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
    UseLukeConfig,
    UseLukeReturn,
    ProviderInfo,
    VoiceInfo,
    TranscriptionMessage,
    ConnectionState,
    ServerMessage,
    ClientMessage,
} from '../types.js';

export function useLuke(config: UseLukeConfig): UseLukeReturn {
    // Connection state
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [error, setError] = useState<Error | null>(null);

    // Provider and voice state
    const [providers, setProviders] = useState<ProviderInfo[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
    const [selectedVoice, setSelectedVoice] = useState<VoiceInfo | null>(null);

    // Session state
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sampleRate, setSampleRate] = useState<number | null>(null);

    // Audio state
    const [isRecording, setIsRecording] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);

    // Transcription state
    const [transcription, setTranscription] = useState<TranscriptionMessage[]>([]);

    // Refs for WebSocket and audio
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    const isRecordingRef = useRef(false);

    // Playback queue for received audio
    const playbackQueueRef = useRef<Float32Array[]>([]);
    const isPlayingRef = useRef(false);

    // Build WebSocket URL with auth token
    const buildWsUrl = useCallback(() => {
        const url = new URL(config.serverUrl);
        if (config.authToken) {
            url.searchParams.set('token', config.authToken);
        }
        return url.toString();
    }, [config.serverUrl, config.authToken]);

    // Handle incoming server messages
    const handleServerMessage = useCallback((event: MessageEvent) => {
        // Binary data is audio - decode and queue for playback
        if (event.data instanceof ArrayBuffer) {
            const decoded = decodeAudio(event.data);
            playbackQueueRef.current.push(decoded);
            playNextAudio();
            return;
        }

        try {
            const message = JSON.parse(event.data) as ServerMessage;

            switch (message.type) {
                case 'handshake':
                    setProviders(message.providers);
                    // Auto-select if only one provider or if there's a default
                    if (message.providers.length === 1) {
                        const provider = message.providers[0];
                        setSelectedProvider(provider);
                        setSelectedVoice(provider.voices[0] ?? null);
                        // Auto-select provider on server
                        if (wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(JSON.stringify({ type: 'select_provider', providerId: provider.id }));
                        }
                    } else if (message.defaultProvider) {
                        const defaultP = message.providers.find((p) => p.id === message.defaultProvider);
                        if (defaultP) {
                            setSelectedProvider(defaultP);
                            setSelectedVoice(defaultP.voices[0] ?? null);
                            // Auto-select default provider on server
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                                wsRef.current.send(JSON.stringify({ type: 'select_provider', providerId: defaultP.id }));
                            }
                        }
                    }
                    break;

                case 'session_ready':
                    setSessionId(message.sessionId);
                    setSampleRate(message.sampleRate);
                    setConnectionState('connected');
                    config.onConnect?.();
                    break;

                case 'transcription':
                    const transcriptionMsg: TranscriptionMessage = {
                        role: message.role,
                        text: message.text,
                        final: message.final,
                        timestamp: Date.now(),
                    };
                    setTranscription((prev) => {
                        if (prev.length > 0) {
                            const lastMsg = prev[prev.length - 1];

                            // 1. Update existing partial if matching role (handles streaming updates and final confirmation)
                            if (lastMsg.role === message.role && !lastMsg.final) {
                                const updated = [...prev];
                                updated[updated.length - 1] = transcriptionMsg;
                                return updated;
                            }

                            // 2. Prevent exact duplicates (same text, same role) - even if last is final
                            // Use normalized comparison (trim whitespace)
                            const normalizedLast = lastMsg.text.trim();
                            const normalizedNew = message.text.trim();
                            if (lastMsg.role === message.role && normalizedLast === normalizedNew) {
                                // If they match, just update the final flag if needed 
                                if (!lastMsg.final && message.final) {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = transcriptionMsg;
                                    return updated;
                                }
                                return prev; // Skip duplicate
                            }

                            // 3. Cleanup "zombie" partials on role switch (interruption)
                            if (lastMsg.role !== message.role && !lastMsg.final && lastMsg.text.trim().length < 5) {
                                const cleaned = prev.slice(0, -1);
                                return [...cleaned, transcriptionMsg];
                            }
                        }
                        // Otherwise append as a new message
                        return [...prev, transcriptionMsg];
                    });
                    config.onTranscription?.(transcriptionMsg);
                    break;

                case 'turn_complete':
                    // Model finished speaking
                    break;

                case 'interrupted':
                    // Clear playback queue on interruption
                    playbackQueueRef.current = [];
                    break;

                case 'error':
                    const err = new Error(`${message.code}: ${message.message}`);
                    setError(err);
                    config.onError?.(err);
                    break;
            }
        } catch {
            // Ignore parse errors
        }
    }, [config]);

    // Send message to server
    const sendMessage = useCallback((message: ClientMessage) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);

    // Connect to server
    const connect = useCallback(() => {
        if (wsRef.current) return;

        setConnectionState('connecting');
        setError(null);

        const ws = new WebSocket(buildWsUrl());
        wsRef.current = ws;

        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            // Wait for handshake message
        };

        ws.onmessage = handleServerMessage;

        ws.onerror = () => {
            setError(new Error('WebSocket connection failed'));
            setConnectionState('error');
        };

        ws.onclose = () => {
            wsRef.current = null;
            setConnectionState('disconnected');
            setSessionId(null);
            config.onDisconnect?.();
        };
    }, [buildWsUrl, handleServerMessage, config]);

    // Audio encoding helper (inline, no worker needed)
    const encodeAudio = useCallback((samples: Float32Array, targetRate: number): ArrayBuffer => {
        // Resample from 48kHz to target rate
        const ratio = 48000 / targetRate;
        const outputLength = Math.ceil(samples.length / ratio);
        const resampled = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcFloor = Math.floor(srcIndex);
            const srcCeil = Math.min(srcFloor + 1, samples.length - 1);
            const frac = srcIndex - srcFloor;
            resampled[i] = samples[srcFloor] * (1 - frac) + samples[srcCeil] * frac;
        }

        // Convert to 16-bit PCM
        const pcm = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
            const s = Math.max(-1, Math.min(1, resampled[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Calculate level
        let sum = 0;
        for (let i = 0; i < resampled.length; i++) {
            sum += resampled[i] * resampled[i];
        }
        setAudioLevel(Math.sqrt(sum / resampled.length));

        return pcm.buffer;
    }, []);

    // Audio decoding helper
    const decodeAudio = useCallback((pcmData: ArrayBuffer): Float32Array => {
        const pcm = new Int16Array(pcmData);
        const float32 = new Float32Array(pcm.length);

        for (let i = 0; i < pcm.length; i++) {
            float32[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
        }

        // Resample from 24kHz to 48kHz
        const ratio = 24000 / 48000;
        const outputLength = Math.ceil(float32.length / ratio);
        const resampled = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcFloor = Math.floor(srcIndex);
            const srcCeil = Math.min(srcFloor + 1, float32.length - 1);
            const frac = srcIndex - srcFloor;
            resampled[i] = float32[srcFloor] * (1 - frac) + float32[srcCeil] * frac;
        }

        return resampled;
    }, []);

    // Disconnect from server
    const disconnect = useCallback(() => {
        stopRecording();
        wsRef.current?.close();
        wsRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
    }, []);

    // Select provider
    const selectProvider = useCallback((providerId: string, voiceId?: string) => {
        const provider = providers.find((p) => p.id === providerId);
        if (!provider) return;

        setSelectedProvider(provider);
        const voice = voiceId ? provider.voices.find((v) => v.id === voiceId) : provider.voices[0];
        setSelectedVoice(voice ?? null);

        sendMessage({ type: 'select_provider', providerId, voiceId: voice?.id });
    }, [providers, sendMessage]);

    // Select voice
    const selectVoice = useCallback((voiceId: string) => {
        if (!selectedProvider) return;
        const voice = selectedProvider.voices.find((v) => v.id === voiceId);
        if (voice) {
            setSelectedVoice(voice);
            // Re-select provider with new voice
            sendMessage({ type: 'select_provider', providerId: selectedProvider.id, voiceId });
        }
    }, [selectedProvider, sendMessage]);

    // Start recording audio
    const startRecording = useCallback(async () => {
        if (isRecording) return;
        isRecordingRef.current = true;

        try {
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 48000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            mediaStreamRef.current = stream;

            // Create audio context
            const ctx = new AudioContext({ sampleRate: 48000 });
            audioContextRef.current = ctx;

            // Load audio worklet
            await ctx.audioWorklet.addModule(
                URL.createObjectURL(
                    new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' })
                )
            );

            // Create worklet node
            const source = ctx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(ctx, 'audio-processor');
            workletNodeRef.current = worklet;

            // Handle audio data from worklet
            worklet.port.onmessage = (event) => {
                if (!isRecordingRef.current) return;

                const samples = event.data as Float32Array;
                // Encode and send to server
                if (wsRef.current?.readyState === WebSocket.OPEN && sampleRate) {
                    const pcm = encodeAudio(new Float32Array(samples), sampleRate);
                    wsRef.current.send(pcm);
                }
            };

            source.connect(worklet);
            setIsRecording(true);
        } catch (err) {
            isRecordingRef.current = false;
            const error = err instanceof Error ? err : new Error('Failed to start recording');
            setError(error);
            config.onError?.(error);
        }
    }, [isRecording, config]);

    // Stop recording
    const stopRecording = useCallback(() => {
        if (!isRecording) return;
        isRecordingRef.current = false;

        // Clear worklet message handler first
        if (workletNodeRef.current) {
            workletNodeRef.current.port.onmessage = null;
            workletNodeRef.current.disconnect();
            workletNodeRef.current = null;
        }

        // Stop all media tracks
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        // Close audio context (but keep it for playback if needed)
        // audioContextRef.current?.close();
        // audioContextRef.current = null;

        setIsRecording(false);
        setAudioLevel(0);
    }, [isRecording]);

    // Play queued audio
    const playNextAudio = useCallback(() => {
        if (isPlayingRef.current || playbackQueueRef.current.length === 0) return;
        if (!audioContextRef.current) return;

        isPlayingRef.current = true;
        const samples = playbackQueueRef.current.shift()!;

        // Create new Float32Array with explicit ArrayBuffer type
        const audioData = new Float32Array(samples.length);
        audioData.set(samples);

        const buffer = audioContextRef.current.createBuffer(1, audioData.length, 48000);
        buffer.copyToChannel(audioData, 0);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);

        source.onended = () => {
            isPlayingRef.current = false;
            playNextAudio();
        };

        source.start();
    }, []);

    // Clear transcription
    const clearTranscription = useCallback(() => {
        setTranscription([]);
    }, []);

    // Auto-connect if configured
    useEffect(() => {
        if (config.autoConnect) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, []);

    return {
        connectionState,
        isConnected: connectionState === 'connected',
        connect,
        disconnect,
        error,

        providers,
        selectedProvider,
        selectProvider,

        voices: selectedProvider?.voices ?? [],
        selectedVoice,
        selectVoice,

        isRecording,
        startRecording,
        stopRecording,
        audioLevel,

        transcription,
        clearTranscription,

        sessionId,
        sampleRate,
    };
}

// AudioWorklet processor code (inlined to avoid separate file)
const AUDIO_WORKLET_CODE = `
class AudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const samples = input[0];
      if (samples && samples.length > 0) {
        this.port.postMessage(new Float32Array(samples));
      }
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;
