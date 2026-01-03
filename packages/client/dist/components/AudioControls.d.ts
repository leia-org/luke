import React from 'react';
export interface AudioControlsProps {
    className?: string;
    renderButton?: (props: {
        isRecording: boolean;
        isConnected: boolean;
        onClick: () => void;
    }) => React.ReactNode;
    renderLevel?: (level: number) => React.ReactNode;
}
export declare function AudioControls({ className, renderButton, renderLevel, }: AudioControlsProps): React.ReactElement;
//# sourceMappingURL=AudioControls.d.ts.map