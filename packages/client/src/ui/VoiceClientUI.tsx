import React, { useEffect } from 'react';
import { useLukeContextOptional } from '../components/LukeProvider.js';
import { MicIcon, StopIcon, TrashIcon, XIcon, MaximizeIcon, MinimizeIcon, SettingsIcon } from './components/Icons';
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

export const VoiceClientUI: React.FC<VoiceClientUIProps> = ({
    luke: lukeProp,
    mode = 'modal',
    position = 'bottom-right',
    theme = 'light',
    title = 'Luke AI',
    width,
    height,
    onClose,
    showSettings = true,
    showTranscription = true,
    showProviderSelector = true,
    showExpandButton = true,
    onTranscription
}) => {
    // Use provided luke prop if available, otherwise fall back to context
    const contextLuke = useLukeContextOptional();
    const lukeState = lukeProp ?? contextLuke;
    if (!lukeState) {
        throw new Error('VoiceClientUI requires either a `luke` prop or to be wrapped in a LukeProvider');
    }
    const {
        isConnected,
        isRecording,
        startRecording,
        stopRecording,
        transcription,
        clearTranscription,
        audioLevel,
        connectionState,
        connect,
        providers,
        selectedProvider,
        selectProvider,
        voices,
        selectedVoice,
        selectVoice,
        error
    } = lukeState;

    const [isExpanded, setIsExpanded] = React.useState(mode === 'fullscreen');
    const [currentMode, setCurrentMode] = React.useState(mode);
    const lastEmittedIndexRef = React.useRef(-1);
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

    // Emit new transcriptions to external callback
    useEffect(() => {
        if (!onTranscription || transcription.length === 0) return;
        for (let i = lastEmittedIndexRef.current + 1; i < transcription.length; i++) {
            onTranscription(transcription[i]);
        }
        lastEmittedIndexRef.current = transcription.length - 1;
    }, [transcription, onTranscription]);

    // Auto-scroll logic
    const [autoScroll, setAutoScroll] = React.useState(true);
    const [hasScroll, setHasScroll] = React.useState(false);
    const messagesRef = React.useRef<HTMLDivElement>(null);
    const prevLengthRef = React.useRef(0);

    // Check if scroll is needed
    useEffect(() => {
        if (messagesRef.current) {
            const { scrollHeight, clientHeight } = messagesRef.current;
            setHasScroll(scrollHeight > clientHeight);
        }
    }, [transcription, currentMode, width, height]);

    useEffect(() => {
        // Only scroll if autoScroll is enabled AND a NEW message has been added
        // We compare current length with previous length to ignore updates to existing messages
        if (autoScroll && transcription.length > prevLengthRef.current) {
            if (messagesRef.current) {
                // Use setTimeout to ensure DOM has updated
                setTimeout(() => {
                    if (messagesRef.current) {
                        messagesRef.current.scrollTo({
                            top: messagesRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 10);
            }
        }
        prevLengthRef.current = transcription.length;
    }, [transcription, autoScroll]);

    useEffect(() => {
        setCurrentMode(mode);
    }, [mode]);

    // Apply theme
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-luke-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-luke-theme', theme);
        }
    }, [theme]);

    const handleMicClick = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const toggleMaximize = () => {
        if (currentMode === 'modal') {
            setCurrentMode('fullscreen');
        } else {
            setCurrentMode('modal');
        }
    };

    const containerStyle: React.CSSProperties = {};
    if (currentMode === 'modal') {
        if (width) containerStyle.width = width;
        if (height) containerStyle.height = height;
    }

    return (
        <div
            className={`luke-wrapper luke-mode-${currentMode} luke-pos-${position}`}
            style={containerStyle}
            data-luke-theme={theme}
        >
            {/* Header */}
            <header className="luke-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className={`status-dot ${connectionState === 'connected' ? 'connected' : ''}`}
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: connectionState === 'connected' ? 'var(--luke-success-color)' : 'var(--luke-text-secondary)'
                        }}
                    />
                    <span className="luke-header-title">{title}</span>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                    {showTranscription && transcription.length > 0 && (
                        <button onClick={clearTranscription} className="luke-btn-icon" title="Clear chat">
                            <TrashIcon />
                        </button>
                    )}
                    {showExpandButton && (
                        <button onClick={toggleMaximize} className="luke-btn-icon">
                            {currentMode === 'modal' ? <MaximizeIcon /> : <MinimizeIcon />}
                        </button>
                    )}
                    {onClose && (
                        <button onClick={onClose} className="luke-btn-icon">
                            <XIcon />
                        </button>
                    )}
                </div>
            </header>

            {/* Body */}
            <div className="luke-body">
                {showTranscription && (
                    <>
                        <div className="luke-messages" ref={messagesRef}>
                            {transcription.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--luke-text-secondary)', textAlign: 'center', fontSize: '14px', padding: '20px' }}>
                                    {isConnected ? 'Say hello!' : 'Connecting...'}
                                </div>
                            ) : (
                                transcription.map((msg: TranscriptionMessage, idx: number) => (
                                    <div key={idx} className={`luke-message ${msg.role}`}>
                                        <span className="luke-role-label">{msg.role === 'user' ? 'You' : 'AI'}</span>
                                        <div className="luke-bubble">
                                            {msg.text}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Auto Scroll Toggle */}
                        {hasScroll && (
                            <div style={{ position: 'absolute', bottom: '260px', right: '20px', zIndex: 10 }}>
                                <button
                                    onClick={() => setAutoScroll(!autoScroll)}
                                    className={`luke-btn-icon ${autoScroll ? 'active' : ''}`}
                                    title={autoScroll ? "Disable Auto-scroll" : "Enable Auto-scroll"}
                                    style={{ backgroundColor: autoScroll ? 'var(--luke-primary-bg)' : 'var(--luke-bg-color)', color: autoScroll ? 'var(--luke-primary-fg)' : 'var(--luke-text-secondary)', boxShadow: 'var(--luke-shadow-md)', width: 32, height: 32, borderRadius: '50%' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <polyline points="19 12 12 19 5 12"></polyline>
                                    </svg>
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Controls */}
                <div className="luke-controls">
                    {error && (
                        <div style={{ padding: '8px', background: '#fee2e2', color: '#ef4444', borderRadius: '4px', fontSize: '12px' }}>
                            {error.message}
                        </div>
                    )}

                    {connectionState === 'disconnected' ? (
                        <button
                            onClick={connect}
                            style={{ width: '100%', padding: '12px', background: 'var(--luke-primary-bg)', color: 'var(--luke-primary-fg)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                        >
                            Connect
                        </button>
                    ) : (
                        <div className="luke-mic-area">
                            <div className="luke-mic-wrapper">
                                {isRecording && (
                                    <div className="luke-visualizer" style={{ transform: `translate(-50%, -50%) scale(${1 + audioLevel * 0.5})` }} />
                                )}
                                <button
                                    className={`luke-mic-btn ${isRecording ? 'active' : ''}`}
                                    onClick={handleMicClick}
                                    disabled={!isConnected}
                                >
                                    {isRecording ? <StopIcon /> : <MicIcon />}
                                </button>
                            </div>
                            <span className="luke-status-text">
                                {isRecording ? 'Listening...' : 'Tap to speak'}
                            </span>

                            {showProviderSelector && (
                                <div className="luke-pills-container">
                                    {/* Provider Selection Pill */}
                                    {selectedProvider && (
                                        <div className="luke-selection-pill">
                                            <select
                                                value={selectedProvider.id}
                                                onChange={(e) => selectProvider(e.target.value)}
                                                className="luke-pill-select"
                                            >
                                                {providers.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name}</option>
                                                ))}
                                            </select>
                                            <div className="luke-pill-icon">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
                                                    <path d="M12 8v8" />
                                                    <path d="M8 12h8" />
                                                </svg>
                                            </div>
                                            <span className="luke-pill-label">{selectedProvider.name}</span>
                                            <div className="luke-pill-chevron">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </div>
                                        </div>
                                    )}

                                    {/* Voice Selection Pill */}
                                    {selectedVoice && (
                                        <div className="luke-selection-pill">
                                            <select
                                                value={selectedVoice.id}
                                                onChange={(e) => selectVoice(e.target.value)}
                                                className="luke-pill-select"
                                            >
                                                {voices.map(v => (
                                                    <option key={v.id} value={v.id}>{v.name}</option>
                                                ))}
                                            </select>
                                            <div className="luke-pill-icon">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                                    <line x1="12" y1="19" x2="12" y2="23" />
                                                    <line x1="8" y1="23" x2="16" y2="23" />
                                                </svg>
                                            </div>
                                            <span className="luke-pill-label">{selectedVoice.name}</span>
                                            <div className="luke-pill-chevron">
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
