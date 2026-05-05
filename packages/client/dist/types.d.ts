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
export interface TranscriptionMessage {
    role: 'user' | 'assistant';
    text: string;
    final: boolean;
    timestamp: number;
}
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export interface FrontendTool {
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}
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
    tools?: Record<string, FrontendTool>;
}
export interface UseLukeReturn {
    connectionState: ConnectionState;
    isConnected: boolean;
    connect: () => void;
    disconnect: () => void;
    /** Disconnects and reconnects. Use after changing `tools` so the new
     *  set is declared to the provider at session setup. */
    reload: () => void;
    error: Error | null;
    providers: ProviderInfo[];
    selectedProvider: ProviderInfo | null;
    selectProvider: (providerId: string, voiceId?: string) => void;
    voices: VoiceInfo[];
    selectedVoice: VoiceInfo | null;
    selectVoice: (voiceId: string) => void;
    isRecording: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
    audioLevel: number;
    /** RMS level (0–1) of the assistant's most recently decoded audio chunk. */
    assistantAudioLevel: number;
    transcription: TranscriptionMessage[];
    clearTranscription: () => void;
    sessionId: string | null;
    sampleRate: number | null;
}
export interface LukeProviderProps {
    serverUrl: string;
    authToken?: string;
    autoConnect?: boolean;
    persistence?: boolean;
    persistenceKey?: string;
    tools?: Record<string, FrontendTool>;
    children: React.ReactNode;
}
export type ServerMessage = {
    type: 'handshake';
    providers: ProviderInfo[];
    defaultProvider?: string;
} | {
    type: 'session_ready';
    sessionId: string;
    sampleRate: number;
} | {
    type: 'history';
    messages: TranscriptionMessage[];
} | {
    type: 'transcription';
    role: 'user' | 'assistant';
    text: string;
    final: boolean;
} | {
    type: 'turn_complete';
} | {
    type: 'interrupted';
} | {
    type: 'tool_call';
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
} | {
    type: 'error';
    code: string;
    message: string;
};
export type ClientMessage = {
    type: 'select_provider';
    providerId: string;
    voiceId?: string;
} | {
    type: 'text';
    content: string;
} | {
    type: 'interrupt';
} | {
    type: 'reconnect';
    sessionId: string;
} | {
    type: 'register_tools';
    tools: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
} | {
    type: 'tool_result';
    callId: string;
    result?: unknown;
    error?: string;
};
//# sourceMappingURL=types.d.ts.map