import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLukeContext } from './LukeProvider.js';
export function AudioControls({ className, renderButton, renderLevel, }) {
    const { isRecording, isConnected, startRecording, stopRecording, audioLevel } = useLukeContext();
    const handleClick = () => {
        if (isRecording) {
            stopRecording();
        }
        else {
            startRecording();
        }
    };
    // Default button rendering
    const defaultButton = (_jsx("button", { type: "button", onClick: handleClick, disabled: !isConnected, "aria-label": isRecording ? 'Stop recording' : 'Start recording', style: {
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: isRecording ? '#ef4444' : '#3b82f6',
            color: 'white',
            cursor: isConnected ? 'pointer' : 'not-allowed',
            opacity: isConnected ? 1 : 0.5,
            transition: 'background-color 0.2s',
        }, children: isRecording ? 'Stop' : 'Mic' }));
    // Default level indicator
    const defaultLevel = (_jsx("div", { style: {
            width: 100,
            height: 8,
            backgroundColor: '#e5e7eb',
            borderRadius: 4,
            overflow: 'hidden',
            marginTop: 8,
        }, children: _jsx("div", { style: {
                width: `${Math.min(100, audioLevel * 100)}%`,
                height: '100%',
                backgroundColor: '#22c55e',
                transition: 'width 0.05s',
            } }) }));
    return (_jsxs("div", { className: className, style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }, children: [renderButton
                ? renderButton({ isRecording, isConnected, onClick: handleClick })
                : defaultButton, renderLevel ? renderLevel(audioLevel) : defaultLevel] }));
}
//# sourceMappingURL=AudioControls.js.map