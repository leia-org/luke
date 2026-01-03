import React from 'react';
import type { TranscriptionMessage } from '../types.js';
export interface TranscriptionDisplayProps {
    messages: TranscriptionMessage[];
    className?: string;
    renderMessage?: (message: TranscriptionMessage, index: number) => React.ReactNode;
}
export declare function TranscriptionDisplay({ messages, className, renderMessage, }: TranscriptionDisplayProps): React.ReactElement;
//# sourceMappingURL=TranscriptionDisplay.d.ts.map