import React from 'react';
export type LukeUIMode = 'fullscreen' | 'modal';
export type LukeUIPosition = 'bottom-right' | 'bottom-left' | 'center';
export type LukeUITheme = 'light' | 'dark' | 'auto';
interface VoiceClientUIProps {
    mode?: LukeUIMode;
    position?: LukeUIPosition;
    theme?: LukeUITheme;
    title?: string;
    width?: string;
    height?: string;
    onClose?: () => void;
    showSettings?: boolean;
}
export declare const VoiceClientUI: React.FC<VoiceClientUIProps>;
export {};
//# sourceMappingURL=VoiceClientUI.d.ts.map