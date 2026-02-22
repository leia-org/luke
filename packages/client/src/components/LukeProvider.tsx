// LukeProvider Component
// React context provider for realtime AI voice communication

import React, { createContext, useContext, useMemo } from 'react';
import { useLuke } from '../hooks/useLuke.js';
import type { UseLukeReturn, LukeProviderProps } from '../types.js';

// Context for Luke state
const LukeContext = createContext<UseLukeReturn | null>(null);

// Provider component wraps children with Luke context
export function LukeProvider({
    serverUrl,
    authToken,
    autoConnect = false,
    persistence,
    persistenceKey,
    children,
}: LukeProviderProps): React.ReactElement {
    const luke = useLuke({
        serverUrl,
        authToken,
        autoConnect,
        persistence,
        persistenceKey,
    });

    return (
        <LukeContext.Provider value={luke}>
            {children}
        </LukeContext.Provider>
    );
}

// Hook to access Luke context (throws if no provider)
export function useLukeContext(): UseLukeReturn {
    const context = useContext(LukeContext);

    if (!context) {
        throw new Error('useLukeContext must be used within a LukeProvider');
    }

    return context;
}

// Hook to access Luke context (returns null if no provider)
export function useLukeContextOptional(): UseLukeReturn | null {
    return useContext(LukeContext);
}
