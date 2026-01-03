// TranscriptionDisplay Component
// Shows conversation transcription messages

import React from 'react';
import type { TranscriptionMessage } from '../types.js';

export interface TranscriptionDisplayProps {
    messages: TranscriptionMessage[];
    className?: string;
    // Custom render for individual messages
    renderMessage?: (message: TranscriptionMessage, index: number) => React.ReactNode;
}

export function TranscriptionDisplay({
    messages,
    className,
    renderMessage,
}: TranscriptionDisplayProps): React.ReactElement {
    // Default message rendering
    const defaultRenderMessage = (message: TranscriptionMessage, index: number) => (
        <div
            key={`${message.timestamp}-${index}`}
            style={{
                padding: '8px 12px',
                marginBottom: 8,
                borderRadius: 8,
                maxWidth: '80%',
                alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: message.role === 'user' ? '#3b82f6' : '#f3f4f6',
                color: message.role === 'user' ? 'white' : '#1f2937',
                opacity: message.final ? 1 : 0.7,
            }}
        >
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                {message.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div>{message.text}</div>
        </div>
    );

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: 16,
                overflowY: 'auto',
            }}
        >
            {messages.map((msg, idx) =>
                renderMessage ? renderMessage(msg, idx) : defaultRenderMessage(msg, idx)
            )}
        </div>
    );
}
