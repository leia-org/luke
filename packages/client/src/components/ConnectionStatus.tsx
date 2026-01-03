// ConnectionStatus Component
// Shows connection state and provider info

import React from 'react';
import { useLukeContext } from './LukeProvider.js';

export interface ConnectionStatusProps {
    className?: string;
    showProvider?: boolean;
}

export function ConnectionStatus({
    className,
    showProvider = true,
}: ConnectionStatusProps): React.ReactElement {
    const { connectionState, selectedProvider, connect, disconnect } = useLukeContext();

    const statusColors: Record<string, string> = {
        disconnected: '#9ca3af',
        connecting: '#f59e0b',
        connected: '#22c55e',
        error: '#ef4444',
    };

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                backgroundColor: '#f9fafb',
                borderRadius: 8,
            }}
        >
            {/* Status indicator */}
            <div
                style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: statusColors[connectionState],
                }}
            />

            {/* Status text */}
            <span style={{ fontSize: 14, color: '#374151' }}>
                {connectionState.charAt(0).toUpperCase() + connectionState.slice(1)}
            </span>

            {/* Provider name */}
            {showProvider && selectedProvider && (
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                    ({selectedProvider.name})
                </span>
            )}

            {/* Connect/Disconnect button */}
            <button
                type="button"
                onClick={connectionState === 'disconnected' ? connect : disconnect}
                style={{
                    marginLeft: 'auto',
                    padding: '4px 12px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    backgroundColor: 'white',
                    cursor: 'pointer',
                }}
            >
                {connectionState === 'disconnected' ? 'Connect' : 'Disconnect'}
            </button>
        </div>
    );
}
