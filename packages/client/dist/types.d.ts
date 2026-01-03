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
export interface UseLukeConfig {
    serverUrl: string;
    authToken?: string;
    autoConnect?: boolean;
    onTranscription?: (transcription: TranscriptionMessage) => void;
    onError?: (error: Error) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
}
export interface UseLukeReturn {
    connectionState: ConnectionState;
    isConnected: boolean;
    connect: () => void;
    disconnect: () => void;
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
    transcription: TranscriptionMessage[];
    clearTranscription: () => void;
    sessionId: string | null;
    sampleRate: number | null;
}
export interface LukeProviderProps {
    serverUrl: string;
    authToken?: string;
    autoConnect?: boolean;
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
    type: 'transcription';
    role: 'user' | 'assistant';
    text: string;
    final: boolean;
} | {
    type: 'turn_complete';
} | {
    type: 'interrupted';
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
};
//# sourceMappingURL=types.d.ts.map