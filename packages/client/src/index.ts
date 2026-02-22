// @leia-org/luke-client - React client for realtime AI voice communication
// Main entry point and public exports

// Components
export { LukeProvider, useLukeContext, useLukeContextOptional } from './components/LukeProvider.js';
export { AudioControls } from './components/AudioControls.js';
export { TranscriptionDisplay } from './components/TranscriptionDisplay.js';
export { ConnectionStatus } from './components/ConnectionStatus.js';

// Hooks
export { useLuke } from './hooks/useLuke.js';

// Types
export type {
    UseLukeConfig,
    UseLukeReturn,
    LukeProviderProps,
    ProviderInfo,
    VoiceInfo,
    TranscriptionMessage,
    ConnectionState,
} from './types.js';
export type { AudioControlsProps } from './components/AudioControls.js';
export type { TranscriptionDisplayProps } from './components/TranscriptionDisplay.js';
export type { ConnectionStatusProps } from './components/ConnectionStatus.js';

// UI
export * from './ui/index.js';
