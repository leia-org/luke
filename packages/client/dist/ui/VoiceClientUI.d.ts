import React from 'react';
import { TranscriptionMessage, UseLukeReturn } from '../types.js';
export type LukeUIMode = 'fullscreen' | 'modal' | 'inline';
export type LukeUIPosition = 'bottom-right' | 'bottom-left' | 'center';
export type LukeUITheme = 'light' | 'dark' | 'auto';
interface VoiceClientUIProps {
    luke?: UseLukeReturn;
    mode?: LukeUIMode;
    position?: LukeUIPosition;
    theme?: LukeUITheme;
    title?: string;
    width?: string;
    height?: string;
    onClose?: () => void;
    showSettings?: boolean;
    showTranscription?: boolean;
    showProviderSelector?: boolean;
    showExpandButton?: boolean;
    onTranscription?: (message: TranscriptionMessage) => void;
}
export declare const VoiceClientUI: React.FC<VoiceClientUIProps>;
export {};
//# sourceMappingURL=VoiceClientUI.d.ts.map