// Types for @leia-org/luke-server
// Defines the core interfaces for providers, sessions, and configuration

import type { IncomingMessage } from 'http';
import type { z } from 'zod';

// Provider identification
export type ProviderName = 'openai' | 'gemini';

// Voice configuration exposed to clients
export interface VoiceConfig {
    id: string;
    name: string;
    language?: string;
}

// Provider interface - implemented by openai() and gemini()
export interface LukeProvider {
    readonly id: string;
    readonly name: ProviderName;
    readonly sampleRate: 24000 | 16000;
    readonly voices: VoiceConfig[];
    connect(config: ProviderSessionConfig): Promise<ProviderConnection>;
}

// Configuration passed when creating a provider session
export interface ProviderSessionConfig {
    model?: string;
    voice?: string;
    systemInstruction?: string;
    history?: Transcription[];
    tools?: ToolDefinition[];
    transcription?: {
        input?: boolean;
        output?: boolean;
    };
}

// Active connection to a provider (OpenAI/Gemini WebSocket)
export interface ProviderConnection {
    send(message: ProviderMessage): void;
    onAudio(handler: (audio: Uint8Array) => void): void;
    onTranscription(handler: (transcription: Transcription) => void): void;
    onTurnComplete(handler: () => void): void;
    onInterrupted(handler: () => void): void;
    onError(handler: (error: Error) => void): void;
    interrupt(): void;
    disconnect(): Promise<void>;
}

// Messages sent to the provider
export type ProviderMessage =
    | { type: 'audio'; data: Uint8Array }
    | { type: 'text'; content: string };

// Transcription from either user input or assistant output
export interface Transcription {
    role: 'user' | 'assistant';
    text: string;
    final: boolean;
}

// Tool definition following AI SDK pattern
export interface ToolDefinition<T = unknown> {
    name: string;
    description: string;
    parameters: z.ZodType<T>;
    execute: (params: T) => Promise<unknown>;
}

// JWT configuration for auth
export interface JwtConfig {
    secret: string;
    algorithms?: string[];
}

// Auth configuration
export interface AuthConfig<TUser = unknown> {
    jwt?: JwtConfig;
    validate: (decoded: Record<string, unknown>, req: IncomingMessage) => Promise<TUser | null>;
}

// Session mapping configuration
export interface SessionConfig<TSession = unknown, TUser = unknown> {
    resolve?: (req: IncomingMessage, user: TUser) => Promise<TSession | null>;
    create?: (user: TUser, provider: LukeProvider) => Promise<TSession>;
    onEnd?: (session: TSession, reason: 'disconnect' | 'error' | 'timeout') => Promise<void>;
    getHistory?: (session: TSession) => Promise<Transcription[]>;
    saveHistory?: (session: TSession, transcription: Transcription) => Promise<void>;
    getSystemInstruction?: (session: TSession) => Promise<string | undefined>;
}

// Server configuration passed to createLukeServer
export interface LukeServerConfig<TUser = unknown, TSession = unknown> {
    server?: import('http').Server;
    path?: string;
    providers: LukeProvider[];
    auth: AuthConfig<TUser>;
    session?: SessionConfig<TSession, TUser>;
    config?: Partial<Omit<ProviderSessionConfig, 'systemInstruction'>>;
    onConnect?: (session: LukeSession<TSession>, user: TUser) => void;
    onDisconnect?: (session: LukeSession<TSession>, user: TUser) => void;
    onTranscription?: (transcription: Transcription, session: LukeSession<TSession>) => void;
}

// Active session managed by the server
export interface LukeSession<TSession = unknown> {
    id: string;
    providerId: string;
    providerConnection: ProviderConnection | null;
    userSession: TSession | null;
    createdAt: Date;
}

// Handshake message sent to client on connection
export interface HandshakeMessage {
    type: 'handshake';
    providers: Array<{
        id: string;
        name: ProviderName;
        sampleRate: 16000 | 24000;
        voices: VoiceConfig[];
    }>;
    defaultProvider?: string;
}

// Messages from client to server
export type ClientMessage =
    | { type: 'select_provider'; providerId: string; voiceId?: string }
    | { type: 'audio'; data: ArrayBuffer }
    | { type: 'text'; content: string }
    | { type: 'interrupt' }
    | { type: 'reconnect'; sessionId: string };

// Messages from server to client
export type ServerMessage =
    | HandshakeMessage
    | { type: 'session_ready'; sessionId: string; sampleRate: number }
    | { type: 'history'; messages: Transcription[] }
    | { type: 'audio'; data: ArrayBuffer }
    | { type: 'transcription'; role: 'user' | 'assistant'; text: string; final: boolean }
    | { type: 'turn_complete' }
    | { type: 'interrupted' }
    | { type: 'error'; code: string; message: string };
