import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function TranscriptionDisplay({ messages, className, renderMessage, }) {
    // Default message rendering
    const defaultRenderMessage = (message, index) => (_jsxs("div", { style: {
            padding: '8px 12px',
            marginBottom: 8,
            borderRadius: 8,
            maxWidth: '80%',
            alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
            backgroundColor: message.role === 'user' ? '#3b82f6' : '#f3f4f6',
            color: message.role === 'user' ? 'white' : '#1f2937',
            opacity: message.final ? 1 : 0.7,
        }, children: [_jsx("div", { style: { fontSize: 12, opacity: 0.7, marginBottom: 4 }, children: message.role === 'user' ? 'You' : 'Assistant' }), _jsx("div", { children: message.text })] }, `${message.timestamp}-${index}`));
    return (_jsx("div", { className: className, style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 16,
            overflowY: 'auto',
        }, children: messages.map((msg, idx) => renderMessage ? renderMessage(msg, idx) : defaultRenderMessage(msg, idx)) }));
}
//# sourceMappingURL=TranscriptionDisplay.js.map