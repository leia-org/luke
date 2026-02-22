import { jsx as _jsx } from "react/jsx-runtime";
// LukeProvider Component
// React context provider for realtime AI voice communication
import { createContext, useContext } from 'react';
import { useLuke } from '../hooks/useLuke.js';
// Context for Luke state
const LukeContext = createContext(null);
// Provider component wraps children with Luke context
export function LukeProvider({ serverUrl, authToken, autoConnect = false, persistence, persistenceKey, children, }) {
    const luke = useLuke({
        serverUrl,
        authToken,
        autoConnect,
        persistence,
        persistenceKey,
    });
    return (_jsx(LukeContext.Provider, { value: luke, children: children }));
}
// Hook to access Luke context (throws if no provider)
export function useLukeContext() {
    const context = useContext(LukeContext);
    if (!context) {
        throw new Error('useLukeContext must be used within a LukeProvider');
    }
    return context;
}
// Hook to access Luke context (returns null if no provider)
export function useLukeContextOptional() {
    return useContext(LukeContext);
}
//# sourceMappingURL=LukeProvider.js.map