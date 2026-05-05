// Types for @leia-org/luke-client
// Shared types between client components and hooks

// Provider info received from server handshake
export interface ProviderInfo {
    id: string;
    name: 'openai' | 'gemini';
    sampleRate: 16000 | 24000;
    voices: VoiceInfo[];
}

export interface VoiceInfo {
    id: string;
    name: string;
}

// Transcription message
export interface TranscriptionMessage {
    role: 'user' | 'assistant';
    text: string;
    final: boolean;
    timestamp: number;
}

// Connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// A tool that runs on the client. The handler receives parsed JSON
// arguments from the model and returns any JSON-serializable value
// (or throws to signal an error).
export interface FrontendTool {
    description: string;
    // JSON Schema object describing the parameters the model should fill.
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

// Configuration for useLuke hook
export interface UseLukeConfig {
    serverUrl: string;
    authToken?: string;
    autoConnect?: boolean;
    onTranscription?: (transcription: TranscriptionMessage) => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    persistence?: boolean;
    persistenceKey?: string;
    // Frontend tool functions keyed by name. Declared to the LLM on
    // connect; invoked when the model emits a matching tool call.
    tools?: Record<string, FrontendTool>;
}

// Return type of useLuke hook
export interface UseLukeReturn {
    // Connection state
    connectionState: ConnectionState;
    isConnected: boolean;
    connect: () => void;
    disconnect: () => void;
    /** Disconnects and reconnects. Use after changing `tools` so the new
     *  set is declared to the provider at session setup. */
    reload: () => void;
    error: Error | null;

    // Provider selection
    providers: ProviderInfo[];
    selectedProvider: ProviderInfo | null;
    selectProvider: (providerId: string, voiceId?: string) => void;

    // Voice selection
    voices: VoiceInfo[];
    selectedVoice: VoiceInfo | null;
    selectVoice: (voiceId: string) => void;

    // Audio controls
    isRecording: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    audioLevel: number;
    /** RMS level (0–1) of the assistant's most recently decoded audio chunk. */
    assistantAudioLevel: number;

    // Transcription
    transcription: TranscriptionMessage[];
    clearTranscription: () => void;

    // Session info
    sessionId: string | null;
    sampleRate: number | null;
}

// Props for LukeProvider component
export interface LukeProviderProps {
    serverUrl: string;
    authToken?: string;
    autoConnect?: boolean;
    persistence?: boolean;
    persistenceKey?: string;
    tools?: Record<string, FrontendTool>;
    children: React.ReactNode;
}

// Messages from server
export type ServerMessage =
    | { type: 'handshake'; providers: ProviderInfo[]; defaultProvider?: string }
    | { type: 'session_ready'; sessionId: string; sampleRate: number }
    | { type: 'history'; messages: TranscriptionMessage[] }
    | { type: 'transcription'; role: 'user' | 'assistant'; text: string; final: boolean }
    | { type: 'turn_complete' }
    | { type: 'interrupted' }
    | { type: 'tool_call'; callId: string; name: string; arguments: Record<string, unknown> }
    | { type: 'error'; code: string; message: string };

// Messages to server
export type ClientMessage =
    | { type: 'select_provider'; providerId: string; voiceId?: string }
    | { type: 'text'; content: string }
    | { type: 'interrupt' }
    | { type: 'reconnect'; sessionId: string }
    | { type: 'register_tools'; tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }
    | { type: 'tool_result'; callId: string; result?: unknown; error?: string };
