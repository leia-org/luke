import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect } from 'react';
import { useLukeContextOptional } from '../components/LukeProvider.js';
import { MicIcon, StopIcon, TrashIcon, XIcon, MaximizeIcon, MinimizeIcon } from './components/Icons';
export const VoiceClientUI = ({ luke: lukeProp, mode = 'modal', position = 'bottom-right', theme = 'light', title = 'Luke AI', width, height, onClose, showSettings = true, showTranscription = true, showProviderSelector = true, showExpandButton = true, onTranscription }) => {
    // Use provided luke prop if available, otherwise fall back to context
    const contextLuke = useLukeContextOptional();
    const lukeState = lukeProp ?? contextLuke;
    if (!lukeState) {
        throw new Error('VoiceClientUI requires either a `luke` prop or to be wrapped in a LukeProvider');
    }
    const { isConnected, isRecording, startRecording, stopRecording, transcription, clearTranscription, audioLevel, connectionState, connect, providers, selectedProvider, selectProvider, voices, selectedVoice, selectVoice, error } = lukeState;
    const [isExpanded, setIsExpanded] = React.useState(mode === 'fullscreen');
    const [currentMode, setCurrentMode] = React.useState(mode);
    const lastEmittedIndexRef = React.useRef(-1);
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    // Emit new transcriptions to external callback
    useEffect(() => {
        if (!onTranscription || transcription.length === 0)
            return;
        for (let i = lastEmittedIndexRef.current + 1; i < transcription.length; i++) {
            onTranscription(transcription[i]);
        }
        lastEmittedIndexRef.current = transcription.length - 1;
    }, [transcription, onTranscription]);
    // Auto-scroll logic
    const [autoScroll, setAutoScroll] = React.useState(true);
    const [hasScroll, setHasScroll] = React.useState(false);
    const messagesRef = React.useRef(null);
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
        }
        else {
            root.setAttribute('data-luke-theme', theme);
        }
    }, [theme]);
    const handleMicClick = () => {
        if (isRecording) {
            stopRecording();
        }
        else {
            startRecording();
        }
    };
    const toggleMaximize = () => {
        if (currentMode === 'modal') {
            setCurrentMode('fullscreen');
        }
        else {
            setCurrentMode('modal');
        }
    };
    const containerStyle = {};
    if (currentMode === 'modal') {
        if (width)
            containerStyle.width = width;
        if (height)
            containerStyle.height = height;
    }
    return (_jsxs("div", { className: `luke-wrapper luke-mode-${currentMode} luke-pos-${position}`, style: containerStyle, "data-luke-theme": theme, children: [_jsxs("header", { className: "luke-header", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [_jsx("div", { className: `status-dot ${connectionState === 'connected' ? 'connected' : ''}`, style: {
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: connectionState === 'connected' ? 'var(--luke-success-color)' : 'var(--luke-text-secondary)'
                                } }), _jsx("span", { className: "luke-header-title", children: title })] }), _jsxs("div", { style: { display: 'flex', gap: '4px' }, children: [showTranscription && transcription.length > 0 && (_jsx("button", { onClick: clearTranscription, className: "luke-btn-icon", title: "Clear chat", children: _jsx(TrashIcon, {}) })), showExpandButton && (_jsx("button", { onClick: toggleMaximize, className: "luke-btn-icon", children: currentMode === 'modal' ? _jsx(MaximizeIcon, {}) : _jsx(MinimizeIcon, {}) })), onClose && (_jsx("button", { onClick: onClose, className: "luke-btn-icon", children: _jsx(XIcon, {}) }))] })] }), _jsxs("div", { className: "luke-body", children: [showTranscription && (_jsxs(_Fragment, { children: [_jsx("div", { className: "luke-messages", ref: messagesRef, children: transcription.length === 0 ? (_jsx("div", { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--luke-text-secondary)', textAlign: 'center', fontSize: '14px', padding: '20px' }, children: isConnected ? 'Say hello!' : 'Connecting...' })) : (transcription.map((msg, idx) => (_jsxs("div", { className: `luke-message ${msg.role}`, children: [_jsx("span", { className: "luke-role-label", children: msg.role === 'user' ? 'You' : 'AI' }), _jsx("div", { className: "luke-bubble", children: msg.text })] }, idx)))) }), hasScroll && (_jsx("div", { style: { position: 'absolute', bottom: '260px', right: '20px', zIndex: 10 }, children: _jsx("button", { onClick: () => setAutoScroll(!autoScroll), className: `luke-btn-icon ${autoScroll ? 'active' : ''}`, title: autoScroll ? "Disable Auto-scroll" : "Enable Auto-scroll", style: { backgroundColor: autoScroll ? 'var(--luke-primary-bg)' : 'var(--luke-bg-color)', color: autoScroll ? 'var(--luke-primary-fg)' : 'var(--luke-text-secondary)', boxShadow: 'var(--luke-shadow-md)', width: 32, height: 32, borderRadius: '50%' }, children: _jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), _jsx("polyline", { points: "19 12 12 19 5 12" })] }) }) }))] })), _jsxs("div", { className: "luke-controls", children: [error && (_jsx("div", { style: { padding: '8px', background: '#fee2e2', color: '#ef4444', borderRadius: '4px', fontSize: '12px' }, children: error.message })), connectionState === 'disconnected' ? (_jsx("button", { onClick: connect, style: { width: '100%', padding: '12px', background: 'var(--luke-primary-bg)', color: 'var(--luke-primary-fg)', border: 'none', borderRadius: '8px', cursor: 'pointer' }, children: "Connect" })) : (_jsxs("div", { className: "luke-mic-area", children: [_jsxs("div", { className: "luke-mic-wrapper", children: [isRecording && (_jsx("div", { className: "luke-visualizer", style: { transform: `translate(-50%, -50%) scale(${1 + audioLevel * 0.5})` } })), _jsx("button", { className: `luke-mic-btn ${isRecording ? 'active' : ''}`, onClick: handleMicClick, disabled: !isConnected, children: isRecording ? _jsx(StopIcon, {}) : _jsx(MicIcon, {}) })] }), _jsx("span", { className: "luke-status-text", children: isRecording ? 'Listening...' : 'Tap to speak' }), showProviderSelector && (_jsxs("div", { className: "luke-pills-container", children: [selectedProvider && (_jsxs("div", { className: "luke-selection-pill", children: [_jsx("select", { value: selectedProvider.id, onChange: (e) => selectProvider(e.target.value), className: "luke-pill-select", children: providers.map(p => (_jsx("option", { value: p.id, children: p.name }, p.id))) }), _jsx("div", { className: "luke-pill-icon", children: _jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" }), _jsx("path", { d: "M12 8v8" }), _jsx("path", { d: "M8 12h8" })] }) }), _jsx("span", { className: "luke-pill-label", children: selectedProvider.name }), _jsx("div", { className: "luke-pill-chevron", children: _jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) }) })] })), selectedVoice && (_jsxs("div", { className: "luke-selection-pill", children: [_jsx("select", { value: selectedVoice.id, onChange: (e) => selectVoice(e.target.value), className: "luke-pill-select", children: voices.map(v => (_jsx("option", { value: v.id, children: v.name }, v.id))) }), _jsx("div", { className: "luke-pill-icon", children: _jsxs("svg", { width: "12", height: "12", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }), _jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "23" }), _jsx("line", { x1: "8", y1: "23", x2: "16", y2: "23" })] }) }), _jsx("span", { className: "luke-pill-label", children: selectedVoice.name }), _jsx("div", { className: "luke-pill-chevron", children: _jsx("svg", { width: "10", height: "10", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: _jsx("polyline", { points: "6 9 12 15 18 9" }) }) })] }))] }))] }))] })] })] }));
};
//# sourceMappingURL=VoiceClientUI.js.map