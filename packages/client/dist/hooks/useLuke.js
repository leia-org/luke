// useLuke Hook
// Main React hook for realtime AI voice communication
import { useState, useCallback, useRef, useEffect } from 'react';
export function useLuke(config) {
    // Connection state
    const [connectionState, setConnectionState] = useState('disconnected');
    const [error, setError] = useState(null);
    // Provider and voice state
    const [providers, setProviders] = useState([]);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [selectedVoice, setSelectedVoice] = useState(null);
    // Session state
    const [sessionId, setSessionId] = useState(null);
    const [sampleRate, setSampleRate] = useState(null);
    // Audio state
    const [isRecording, setIsRecording] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    // Transcription state
    const [transcription, setTranscription] = useState(() => {
        // Only load from localStorage if explicitly enabled (client-side persistence)
        if (config.persistence) {
            const key = config.persistenceKey || 'luke_transcription';
            try {
                const stored = sessionStorage.getItem(key);
                return stored ? JSON.parse(stored) : [];
            }
            catch {
                return [];
            }
        }
        return [];
    });
    // Refs for WebSocket and audio
    const wsRef = useRef(null);
    const audioContextRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const workletNodeRef = useRef(null);
    const isRecordingRef = useRef(false);
    const sampleRateRef = useRef(null);
    // Reconnection state
    const isIntentionalDisconnect = useRef(false);
    const reconnectAttempts = useRef(0);
    const reconnectTimeout = useRef(undefined);
    // Playback queue for received audio
    const playbackQueueRef = useRef([]);
    const isPlayingRef = useRef(false);
    const nextPlayTimeRef = useRef(0);
    const activeSourcesRef = useRef([]);
    // Build WebSocket URL with auth token
    const buildWsUrl = useCallback(() => {
        const url = new URL(config.serverUrl);
        if (config.authToken) {
            url.searchParams.set('token', config.authToken);
        }
        return url.toString();
    }, [config.serverUrl, config.authToken]);
    // Handle incoming server messages
    const handleServerMessage = useCallback((event) => {
        // Binary data is audio - decode and queue for playback
        if (event.data instanceof ArrayBuffer) {
            const decoded = decodeAudio(event.data);
            playbackQueueRef.current.push(decoded);
            playNextAudio();
            return;
        }
        try {
            const message = JSON.parse(event.data);
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
                    }
                    else if (message.defaultProvider) {
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
                    sampleRateRef.current = message.sampleRate;
                    setConnectionState('connected');
                    config.onConnect?.();
                    break;
                case 'transcription':
                    const transcriptionMsg = {
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
                    // Stop all playing audio sources immediately
                    activeSourcesRef.current.forEach(s => {
                        try {
                            s.stop();
                        }
                        catch { /* already stopped */ }
                    });
                    activeSourcesRef.current = [];
                    // Clear playback queue and reset scheduling
                    playbackQueueRef.current = [];
                    nextPlayTimeRef.current = 0;
                    isPlayingRef.current = false;
                    break;
                case 'history':
                    // Always accept history from server if sent
                    if (message.messages) {
                        setTranscription((prev) => {
                            // Replace current state with server history
                            // (Ideally we might want to merge, but usually history is authoritative on connect)
                            return message.messages;
                        });
                    }
                    break;
                case 'error':
                    const err = new Error(`${message.code}: ${message.message}`);
                    setError(err);
                    config.onError?.(err);
                    break;
            }
        }
        catch {
            // Ignore parse errors
        }
    }, [config]);
    // Send message to server
    const sendMessage = useCallback((message) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
        }
    }, []);
    // Connect to server
    const connect = useCallback(() => {
        if (wsRef.current)
            return;
        isIntentionalDisconnect.current = false;
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = undefined;
        }
        setConnectionState('connecting');
        setError(null);
        const ws = new WebSocket(buildWsUrl());
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
            // Wait for handshake message
            reconnectAttempts.current = 0;
            if (reconnectTimeout.current) {
                clearTimeout(reconnectTimeout.current);
                reconnectTimeout.current = undefined;
            }
        };
        ws.onmessage = handleServerMessage;
        ws.onerror = () => {
            // Ignore errors from stale WebSocket (e.g. React Strict Mode cleanup)
            if (wsRef.current !== ws)
                return;
            setError(new Error('WebSocket connection failed'));
            setConnectionState('error');
        };
        ws.onclose = () => {
            // Ignore close events from stale WebSocket (e.g. React Strict Mode cleanup)
            if (wsRef.current !== ws)
                return;
            wsRef.current = null;
            setConnectionState('disconnected');
            setSessionId(null);
            config.onDisconnect?.();
            // Handle auto-reconnection
            if (!isIntentionalDisconnect.current && (config.reconnect ?? true)) {
                const maxAttempts = config.maxReconnectAttempts ?? 5;
                const baseInterval = config.reconnectInterval ?? 1000;
                if (reconnectAttempts.current < maxAttempts) {
                    reconnectAttempts.current++;
                    const delay = baseInterval * Math.pow(2, reconnectAttempts.current - 1);
                    console.log(`[Luke] Connection lost. Reconnecting in ${delay}ms (Attempt ${reconnectAttempts.current}/${maxAttempts})`);
                    setConnectionState('connecting');
                    reconnectTimeout.current = setTimeout(() => {
                        connect();
                    }, delay);
                }
                else {
                    const err = new Error(`Connection lost. Max reconnection attempts (${maxAttempts}) reached.`);
                    setError(err);
                    config.onError?.(err);
                    setConnectionState('error');
                }
            }
        };
    }, [buildWsUrl, handleServerMessage, config]);
    // Audio encoding helper (inline, no worker needed)
    const encodeAudio = useCallback((samples, targetRate) => {
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
    const decodeAudio = useCallback((pcmData) => {
        // Ensure even byte length for Int16Array (truncate trailing byte if odd)
        const byteLength = pcmData.byteLength & ~1;
        const pcm = new Int16Array(pcmData, 0, byteLength / 2);
        const float32 = new Float32Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) {
            float32[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
        }
        // Resample from 24kHz to 48kHz (both OpenAI and Gemini output at 24kHz)
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
    // Start recording audio
    const startRecording = useCallback(async () => {
        if (isRecording)
            return;
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
            // Use standard sample rate, but we'll detect what the browser actually gives us
            const ctx = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 48000,
                latencyHint: 'interactive',
            });
            audioContextRef.current = ctx;
            // Load audio worklet
            await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' })));
            // Create worklet node
            const source = ctx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(ctx, 'audio-processor');
            workletNodeRef.current = worklet;
            // Handle audio data from worklet
            worklet.port.onmessage = (event) => {
                if (!isRecordingRef.current)
                    return;
                const samples = event.data;
                // Encode and send to server (use ref to always get latest sampleRate)
                const currentRate = sampleRateRef.current;
                if (wsRef.current?.readyState === WebSocket.OPEN && currentRate) {
                    const pcm = encodeAudio(new Float32Array(samples), currentRate);
                    wsRef.current.send(pcm);
                }
            };
            source.connect(worklet);
            setIsRecording(true);
        }
        catch (err) {
            isRecordingRef.current = false;
            const error = err instanceof Error ? err : new Error('Failed to start recording');
            setError(error);
            config.onError?.(error);
        }
    }, [isRecording, config, encodeAudio, sampleRate]);
    // Stop all audio playback immediately
    const stopPlayback = useCallback(() => {
        activeSourcesRef.current.forEach(s => {
            try {
                s.stop();
            }
            catch { /* already stopped */ }
        });
        activeSourcesRef.current = [];
        playbackQueueRef.current = [];
        nextPlayTimeRef.current = 0;
        isPlayingRef.current = false;
    }, []);
    // Stop recording
    const stopRecording = useCallback(() => {
        if (!isRecording)
            return;
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
        // Stop AI playback and send interrupt to server
        stopPlayback();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'interrupt' }));
        }
        setIsRecording(false);
        setAudioLevel(0);
    }, [isRecording, stopPlayback]);
    // Disconnect from server
    const disconnect = useCallback(() => {
        isIntentionalDisconnect.current = true;
        if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
            reconnectTimeout.current = undefined;
        }
        stopRecording();
        stopPlayback();
        wsRef.current?.close();
        wsRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
    }, [stopRecording, stopPlayback]);
    // Select provider
    const selectProvider = useCallback((providerId, voiceId) => {
        const provider = providers.find((p) => p.id === providerId);
        if (!provider)
            return;
        setSelectedProvider(provider);
        const voice = voiceId ? provider.voices.find((v) => v.id === voiceId) : provider.voices[0];
        setSelectedVoice(voice ?? null);
        sendMessage({ type: 'select_provider', providerId, voiceId: voice?.id });
    }, [providers, sendMessage]);
    // Select voice
    const selectVoice = useCallback((voiceId) => {
        if (!selectedProvider)
            return;
        const voice = selectedProvider.voices.find((v) => v.id === voiceId);
        if (voice) {
            setSelectedVoice(voice);
            // Re-select provider with new voice
            sendMessage({ type: 'select_provider', providerId: selectedProvider.id, voiceId });
        }
    }, [selectedProvider, sendMessage]);
    // Play queued audio with precise scheduling (no gaps between chunks)
    const playNextAudio = useCallback(() => {
        if (!audioContextRef.current || playbackQueueRef.current.length === 0)
            return;
        isPlayingRef.current = true;
        const ctx = audioContextRef.current;
        // Schedule all queued chunks back-to-back
        while (playbackQueueRef.current.length > 0) {
            const samples = playbackQueueRef.current.shift();
            const audioData = new Float32Array(samples.length);
            audioData.set(samples);
            const buffer = ctx.createBuffer(1, audioData.length, 48000);
            buffer.copyToChannel(audioData, 0);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            // Track active source for interruption
            activeSourcesRef.current.push(source);
            // Schedule to start exactly when the previous chunk ends
            const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
            source.start(startTime);
            nextPlayTimeRef.current = startTime + buffer.duration;
            // Track when the last scheduled chunk finishes
            source.onended = () => {
                // Remove from active sources
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
                if (playbackQueueRef.current.length === 0) {
                    isPlayingRef.current = false;
                }
            };
        }
    }, []);
    // Clear transcription
    const clearTranscription = useCallback(() => {
        setTranscription([]);
        if (config.persistence) {
            const key = config.persistenceKey || 'luke_transcription';
            sessionStorage.removeItem(key);
        }
    }, [config.persistence, config.persistenceKey]);
    // Persist to sessionStorage if enabled
    useEffect(() => {
        if (config.persistence) {
            const key = config.persistenceKey || 'luke_transcription';
            sessionStorage.setItem(key, JSON.stringify(transcription));
        }
    }, [transcription, config.persistence, config.persistenceKey]);
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
//# sourceMappingURL=useLuke.js.map