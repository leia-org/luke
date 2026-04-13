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
    const [assistantAudioLevel, setAssistantAudioLevel] = useState(0);

    // Transcription state
    const [transcription, setTranscription] = useState<TranscriptionMessage[]>(() => {
        // Only load from localStorage if explicitly enabled (client-side persistence)
        if (config.persistence) {
            const key = config.persistenceKey || 'luke_transcription';
            try {
                const stored = sessionStorage.getItem(key);
                return stored ? JSON.parse(stored) : [];
            } catch {
                return [];
            }
        }
        return [];
    });

    // Refs for WebSocket and audio
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);
    // True once the AudioWorkletProcessor module has been registered on
    // the current AudioContext. Reset whenever the context is recreated
    // (see startRecording below).
    const workletModuleLoadedRef = useRef(false);
    const isRecordingRef = useRef(false);
    const sampleRateRef = useRef<number | null>(null);

    // Reconnection state
    const isIntentionalDisconnect = useRef(false);
    const reconnectAttempts = useRef(0);
    const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Playback queue for received audio
    const playbackQueueRef = useRef<Float32Array[]>([]);
    const isPlayingRef = useRef(false);
    const nextPlayTimeRef = useRef(0);
    const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
    // Analyser on the playback chain, polled via RAF to report the real
    // assistant audio level while it's actually coming out of the speakers
    // (not when the chunk was received from the network).
    const assistantAnalyserRef = useRef<AnalyserNode | null>(null);
    const assistantLevelRafRef = useRef<number | null>(null);

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
                    sampleRateRef.current = message.sampleRate;
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
                    // Model finished speaking — fade the assistant level
                    setAssistantAudioLevel(0);
                    break;

                case 'interrupted':
                    // Stop all playing audio sources immediately
                    activeSourcesRef.current.forEach(s => {
                        try { s.stop(); } catch { /* already stopped */ }
                    });
                    activeSourcesRef.current = [];
                    // Clear playback queue and reset scheduling
                    playbackQueueRef.current = [];
                    nextPlayTimeRef.current = 0;
                    isPlayingRef.current = false;
                    setAssistantAudioLevel(0);
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
            if (wsRef.current !== ws) return;
            setError(new Error('WebSocket connection failed'));
            setConnectionState('error');
        };

        ws.onclose = () => {
            // Ignore close events from stale WebSocket (e.g. React Strict Mode cleanup)
            if (wsRef.current !== ws) return;
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
                } else {
                    const err = new Error(`Connection lost. Max reconnection attempts (${maxAttempts}) reached.`);
                    setError(err);
                    config.onError?.(err);
                    setConnectionState('error');
                }
            }
        };
    }, [buildWsUrl, handleServerMessage, config]);

    // Resampling and PCM16 encoding happen inside the AudioWorkletProcessor
    // on the audio thread — see AUDIO_WORKLET_CODE at the bottom of this
    // file. The main thread just forwards the resulting ArrayBuffer to
    // the WebSocket. This helper is kept only to compute the RMS level
    // for the UI visualizer from the raw PCM16 bytes.
    const computeLevelFromPcm16 = useCallback((buf: ArrayBuffer) => {
        const view = new Int16Array(buf);
        let sum = 0;
        for (let i = 0; i < view.length; i++) {
            const s = view[i] / 0x8000;
            sum += s * s;
        }
        setAudioLevel(view.length > 0 ? Math.sqrt(sum / view.length) : 0);
    }, []);

    // Audio decoding helper
    const decodeAudio = useCallback((pcmData: ArrayBuffer): Float32Array => {
        // Ensure even byte length for Int16Array (truncate trailing byte if odd)
        const byteLength = pcmData.byteLength & ~1;
        const pcm = new Int16Array(pcmData, 0, byteLength / 2);
        const float32 = new Float32Array(pcm.length);

        for (let i = 0; i < pcm.length; i++) {
            float32[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
        }

        // Resample from the provider's output rate (24kHz for both OpenAI and
        // Gemini) to the AudioContext's actual rate — not a hardcoded 48000,
        // since the browser may run the context at 44100 or other values.
        const destRate = audioContextRef.current?.sampleRate ?? 48000;
        const ratio = 24000 / destRate;
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
        // Use the ref, not the state, as the guard. React effects (including
        // Strict Mode double-invocation) can fire startRecording multiple
        // times before `isRecording` state has propagated, which would
        // otherwise create several ScriptProcessorNodes running in parallel
        // against the same WebSocket — they'd each emit audio every tick
        // and multiply the upload byte rate by N, completely desyncing the
        // provider's view of time.
        if (isRecordingRef.current) return;
        isRecordingRef.current = true;

        // Defensive: tear down any previous worklet / stream the previous
        // startRecording may have left behind. We intentionally DO NOT
        // close the AudioContext here — the same context owns the
        // assistant playback chain (Analyser + BufferSourceNodes). Closing
        // it mid-response would silence the assistant and leave a stale
        // analyser ref that the next playback attempt can't use. The
        // context is only torn down in `disconnect()` or when the hook
        // actually stops for good.
        if (workletNodeRef.current) {
            try { workletNodeRef.current.port.onmessage = null; } catch { /* ignore */ }
            try { workletNodeRef.current.disconnect(); } catch { /* ignore */ }
            workletNodeRef.current = null;
        }
        if (mediaStreamRef.current) {
            try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
            mediaStreamRef.current = null;
        }

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

            // Reuse the existing AudioContext if we already have one (e.g.
            // the user muted and is now unmuting). Creating a new one would
            // orphan the assistant playback chain that lives inside it.
            let ctx = audioContextRef.current;
            if (!ctx) {
                ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
                    sampleRate: 48000,
                    latencyHint: 'interactive',
                });
                audioContextRef.current = ctx;
                workletModuleLoadedRef.current = false;
            } else if (ctx.state === 'suspended') {
                try { await ctx.resume(); } catch { /* ignore */ }
            }

            // AudioWorklet: runs on the dedicated audio thread so we don't
            // block the main thread and the worklet isn't deprecated. We
            // route its output through a muted GainNode to ctx.destination
            // so the graph stays live (Chrome won't call `process()` on a
            // node whose output doesn't reach destination).
            //
            // Only register the processor module on first use per context —
            // calling registerProcessor twice with the same name throws.
            if (!workletModuleLoadedRef.current) {
                await ctx.audioWorklet.addModule(
                    URL.createObjectURL(
                        new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' })
                    )
                );
                workletModuleLoadedRef.current = true;
            }

            const source = ctx.createMediaStreamSource(stream);
            const worklet = new AudioWorkletNode(ctx, 'audio-processor');
            workletNodeRef.current = worklet;

            // Tell the worklet what rate the provider wants. The worklet
            // does the resample + PCM16 encode on the audio thread and
            // posts back ready-to-send ArrayBuffer chunks.
            const targetRate = sampleRateRef.current ?? 16000;
            worklet.port.postMessage({ type: 'setTargetRate', rate: targetRate });

            // Advertise the on-the-wire rate to the server so its pass-through
            // (and optional resample fallback) knows what's coming in.
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'client_audio_format',
                    sampleRate: targetRate,
                }));
            }

            worklet.port.onmessage = (event) => {
                if (!isRecordingRef.current) return;
                // The worklet posts already-encoded PCM16 ArrayBuffers.
                const buf = event.data as ArrayBuffer;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(buf);
                }
                computeLevelFromPcm16(buf);
            };

            source.connect(worklet);
            // Keep the worklet branch alive by routing it through a muted
            // GainNode to destination. Gain is 0 so nothing is played back.
            const sink = ctx.createGain();
            sink.gain.value = 0;
            worklet.connect(sink);
            sink.connect(ctx.destination);
            setIsRecording(true);
        } catch (err) {
            isRecordingRef.current = false;
            const error = err instanceof Error ? err : new Error('Failed to start recording');
            setError(error);
            config.onError?.(error);
        }
    }, [isRecording, config, computeLevelFromPcm16, sampleRate]);

    // Stop all audio playback immediately
    const stopPlayback = useCallback(() => {
        activeSourcesRef.current.forEach(s => {
            try { s.stop(); } catch { /* already stopped */ }
        });
        activeSourcesRef.current = [];
        playbackQueueRef.current = [];
        nextPlayTimeRef.current = 0;
        isPlayingRef.current = false;
        if (assistantLevelRafRef.current != null) {
            cancelAnimationFrame(assistantLevelRafRef.current);
            assistantLevelRafRef.current = null;
        }
        setAssistantAudioLevel(0);
    }, []);

    // Stop recording.
    //
    // This ONLY stops the user's microphone. It intentionally does NOT:
    //   - Stop the assistant's playback mid-sentence (that would cut off
    //     whatever the model was currently saying).
    //   - Send `interrupt` to the server to cancel the in-flight response
    //     (same reason + triggers "Cancellation failed: no active response"
    //     on OpenAI when nothing is active).
    //
    // If a caller wants the "barge-in" behavior (stop mic + cut assistant
    // playback + cancel response), they should invoke `interrupt()` or
    // `stopPlayback()` explicitly alongside this.
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

        setIsRecording(false);
        setAudioLevel(0);
    }, [isRecording]);

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
        // Reset analyser + worklet-module flag tied to the closed context
        // so the next connect rebuilds them on the new context.
        if (assistantLevelRafRef.current != null) {
            cancelAnimationFrame(assistantLevelRafRef.current);
            assistantLevelRafRef.current = null;
        }
        assistantAnalyserRef.current = null;
        workletModuleLoadedRef.current = false;
    }, [stopRecording, stopPlayback]);

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



    // Play queued audio with precise scheduling (no gaps between chunks)
    const playNextAudio = useCallback(() => {
        if (!audioContextRef.current || playbackQueueRef.current.length === 0) return;

        isPlayingRef.current = true;
        const ctx = audioContextRef.current;

        // Create the analyser lazily the first time we have a context so
        // the component can visualize the assistant's real playback level.
        if (!assistantAnalyserRef.current) {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.3;
            analyser.connect(ctx.destination);
            assistantAnalyserRef.current = analyser;
        }
        // Start the RAF polling loop if not already running.
        if (assistantLevelRafRef.current == null) {
            const buf = new Float32Array(assistantAnalyserRef.current.fftSize);
            const tick = () => {
                const a = assistantAnalyserRef.current;
                if (!a) {
                    assistantLevelRafRef.current = null;
                    return;
                }
                a.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                const rms = Math.sqrt(sum / buf.length);
                setAssistantAudioLevel(rms);
                assistantLevelRafRef.current = requestAnimationFrame(tick);
            };
            assistantLevelRafRef.current = requestAnimationFrame(tick);
        }

        // Schedule all queued chunks back-to-back
        while (playbackQueueRef.current.length > 0) {
            const samples = playbackQueueRef.current.shift()!;

            const audioData = new Float32Array(samples.length);
            audioData.set(samples);

            const buffer = ctx.createBuffer(1, audioData.length, 48000);
            buffer.copyToChannel(audioData, 0);

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            // Route through the analyser so the RAF loop sees the actual
            // samples being played out (not just the chunk that was decoded).
            source.connect(assistantAnalyserRef.current!);

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
        assistantAudioLevel,

        transcription,
        clearTranscription,

        sessionId,
        sampleRate,
    };
}

// AudioWorklet processor: runs on the audio thread (off the main thread).
// Accepts a target sample rate via port.postMessage({type:'setTargetRate'})
// and does the resample + Float32→PCM16 conversion in-place, posting back
// the resulting Int16Array buffer. This keeps the main thread entirely
// free of audio work — the main thread only forwards the ArrayBuffer to
// the WebSocket.
//
// The resampler maintains a sub-sample cursor across process() calls so
// non-integer ratios (e.g. 44.1k→16k) don't introduce gaps or clicks at
// block boundaries. Linear interpolation — no anti-aliasing filter. For
// voice content below ~4kHz this is acceptable.
const AUDIO_WORKLET_CODE = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.cursor = 0;       // fractional read position into the next block
    this.tail = null;      // previous block's last sample for cross-block interp
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'setTargetRate') {
        this.targetRate = event.data.rate;
        this.cursor = 0;
        this.tail = null;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const samples = input[0];
    if (!samples || samples.length === 0) return true;

    const srcRate = sampleRate; // AudioWorkletGlobalScope global
    const ratio = srcRate / this.targetRate;

    // Estimate max output length; we'll trim to the exact count used.
    const maxOut = Math.ceil((samples.length + 2) / ratio) + 1;
    const out = new Int16Array(maxOut);

    // Build a virtual source that lets us read index -1 as the previous
    // block's tail, so interpolation across the block boundary is smooth.
    const sampleAt = (idx) => {
      if (idx < 0) return this.tail !== null ? this.tail : samples[0];
      if (idx >= samples.length) return samples[samples.length - 1];
      return samples[idx];
    };

    let written = 0;
    let pos = this.cursor;
    while (pos < samples.length) {
      const idx0 = Math.floor(pos);
      const idx1 = idx0 + 1;
      const frac = pos - idx0;
      const s = sampleAt(idx0) * (1 - frac) + sampleAt(idx1) * frac;
      const clipped = s < -1 ? -1 : (s > 1 ? 1 : s);
      out[written++] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
      pos += ratio;
    }

    // Advance cursor into next block (preserve fractional phase)
    this.cursor = pos - samples.length;
    this.tail = samples[samples.length - 1];

    if (written > 0) {
      // Ship only the used portion
      const packed = out.slice(0, written);
      this.port.postMessage(packed.buffer, [packed.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);
`;
