// AudioControls Component
// Provides microphone button and audio level indicator

import React from 'react';
import { useLukeContext } from './LukeProvider.js';

export interface AudioControlsProps {
    className?: string;
    // Custom render props for flexibility
    renderButton?: (props: {
        isRecording: boolean;
        isConnected: boolean;
        onClick: () => void;
    }) => React.ReactNode;
    renderLevel?: (level: number) => React.ReactNode;
}

export function AudioControls({
    className,
    renderButton,
    renderLevel,
}: AudioControlsProps): React.ReactElement {
    const { isRecording, isConnected, startRecording, stopRecording, audioLevel } = useLukeContext();

    const handleClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Default button rendering
    const defaultButton = (
        <button
            type="button"
            onClick={handleClick}
            disabled={!isConnected}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: isRecording ? '#ef4444' : '#3b82f6',
                color: 'white',
                cursor: isConnected ? 'pointer' : 'not-allowed',
                opacity: isConnected ? 1 : 0.5,
                transition: 'background-color 0.2s',
            }}
        >
            {isRecording ? 'Stop' : 'Mic'}
        </button>
    );

    // Default level indicator
    const defaultLevel = (
        <div
            style={{
                width: 100,
                height: 8,
                backgroundColor: '#e5e7eb',
                borderRadius: 4,
                overflow: 'hidden',
                marginTop: 8,
            }}
        >
            <div
                style={{
                    width: `${Math.min(100, audioLevel * 100)}%`,
                    height: '100%',
                    backgroundColor: '#22c55e',
                    transition: 'width 0.05s',
                }}
            />
        </div>
    );

    return (
        <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {renderButton
                ? renderButton({ isRecording, isConnected, onClick: handleClick })
                : defaultButton}
            {renderLevel ? renderLevel(audioLevel) : defaultLevel}
        </div>
    );
}
