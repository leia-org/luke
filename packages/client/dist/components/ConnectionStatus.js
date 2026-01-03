import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLukeContext } from './LukeProvider.js';
export function ConnectionStatus({ className, showProvider = true, }) {
    const { connectionState, selectedProvider, connect, disconnect } = useLukeContext();
    const statusColors = {
        disconnected: '#9ca3af',
        connecting: '#f59e0b',
        connected: '#22c55e',
        error: '#ef4444',
    };
    return (_jsxs("div", { className: className, style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 16px',
            backgroundColor: '#f9fafb',
            borderRadius: 8,
        }, children: [_jsx("div", { style: {
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: statusColors[connectionState],
                } }), _jsx("span", { style: { fontSize: 14, color: '#374151' }, children: connectionState.charAt(0).toUpperCase() + connectionState.slice(1) }), showProvider && selectedProvider && (_jsxs("span", { style: { fontSize: 12, color: '#6b7280' }, children: ["(", selectedProvider.name, ")"] })), _jsx("button", { type: "button", onClick: connectionState === 'disconnected' ? connect : disconnect, style: {
                    marginLeft: 'auto',
                    padding: '4px 12px',
                    fontSize: 12,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    backgroundColor: 'white',
                    cursor: 'pointer',
                }, children: connectionState === 'disconnected' ? 'Connect' : 'Disconnect' })] }));
}
//# sourceMappingURL=ConnectionStatus.js.map