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

// A tool declaration as sent to the provider. Parameters are already in
// JSON Schema form (converted from zod for backend tools, passed as-is
// for frontend tools). The provider does not care where the tool runs.
export interface ProviderToolDeclaration {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

// Configuration passed when creating a provider session
export interface ProviderSessionConfig {
    model?: string;
    voice?: string;
    systemInstruction?: string;
    history?: Transcription[];
    tools?: ProviderToolDeclaration[];
    transcription?: {
        input?: boolean;
        output?: boolean;
    };
}

// Active connection to a provider (OpenAI/Gemini WebSocket)
// A function-call emitted by the provider. callId is provider-specific
// and must be echoed back via sendToolResult.
export interface ToolCall {
    callId: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ProviderConnection {
    send(message: ProviderMessage): void;
    onAudio(handler: (audio: Uint8Array) => void): void;
    onTranscription(handler: (transcription: Transcription) => void): void;
    onTurnComplete(handler: () => void): void;
    onInterrupted(handler: () => void): void;
    onToolCall(handler: (call: ToolCall) => void): void;
    onError(handler: (error: Error) => void): void;
    interrupt(): void;
    endOfTurn?(): void;
    sendToolResult(callId: string, result: unknown): void;
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

// JSON-schema version of a tool, used for tools whose execution lives
// on the client (the client declares these via register_tools). The
// server never executes them; it only forwards calls.
export interface FrontendToolSchema {
    name: string;
    description: string;
    // JSON Schema object for the function's parameters
    parameters: Record<string, unknown>;
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
    // Backend tools executed on the server. Declared with zod + execute.
    tools?: ToolDefinition[];
    config?: Partial<Omit<ProviderSessionConfig, 'systemInstruction' | 'tools'>>;
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
    | { type: 'reconnect'; sessionId: string }
    | { type: 'client_audio_format'; sampleRate: number }
    | { type: 'register_tools'; tools: FrontendToolSchema[] }
    | { type: 'tool_result'; callId: string; result?: unknown; error?: string };

// Messages from server to client
export type ServerMessage =
    | HandshakeMessage
    | { type: 'session_ready'; sessionId: string; sampleRate: number }
    | { type: 'history'; messages: Transcription[] }
    | { type: 'audio'; data: ArrayBuffer }
    | { type: 'transcription'; role: 'user' | 'assistant'; text: string; final: boolean }
    | { type: 'turn_complete' }
    | { type: 'interrupted' }
    | { type: 'tool_call'; callId: string; name: string; arguments: Record<string, unknown> }
    | { type: 'error'; code: string; message: string };
