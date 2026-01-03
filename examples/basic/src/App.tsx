import { useState, useEffect } from 'react';
import { LukeProvider, VoiceClientUI } from '@leia-org/luke-client';
import Login from './components/Login';
import './App.css';

function App() {
    const [token, setToken] = useState<string | null>(null);
    const [userId, setUserId] = useState<string>('');

    // UI Configuration State
    const [uiMode, setUiMode] = useState<'modal' | 'fullscreen'>('modal');
    const [uiPosition, setUiPosition] = useState<'bottom-right' | 'bottom-left' | 'center'>('bottom-right');
    const [uiTheme, setUiTheme] = useState<'light' | 'dark' | 'auto'>('auto');
    const [showClient, setShowClient] = useState(true);
    const [customTitle, setCustomTitle] = useState('Luke AI');
    const [customWidth, setCustomWidth] = useState<string>('');
    const [customHeight, setCustomHeight] = useState<string>('');

    // Check for stored token
    useEffect(() => {
        const stored = localStorage.getItem('luke_token');
        if (stored) {
            setToken(stored);
        }
    }, []);

    const handleLogin = async (username: string) => {
        try {
            const res = await fetch('http://localhost:3002/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: username }),
            });

            if (!res.ok) throw new Error('Auth failed');

            const { token } = await res.json();
            localStorage.setItem('luke_token', token);
            setToken(token);
            setUserId(username);
        } catch (err) {
            console.error('Login error:', err);
            alert('Failed to authenticate. Is the server running?');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('luke_token');
        setToken(null);
    };

    if (!token) {
        return <Login onLogin={handleLogin} />;
    }

    return (
        <LukeProvider serverUrl="ws://localhost:3001" authToken={token}>
            <div className="demo-dashboard" style={{
                height: '100vh',
                background: '#f0f2f5',
                padding: '40px',
                fontFamily: 'system-ui, sans-serif',
                boxSizing: 'border-box'
            }}>
                <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                        <h1 style={{ margin: 0, fontSize: '24px', color: '#1f2937' }}>Luke AI Demo</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span style={{ color: '#4b5563' }}>{userId}</span>
                            <button onClick={handleLogout} style={{ padding: '8px 16px', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', color: '#374151' }}>
                                Logout
                            </button>
                        </div>
                    </div>

                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
                        <h2 style={{ marginTop: 0, fontSize: '18px', color: '#1f2937', marginBottom: '20px' }}>Component Configuration</h2>

                        <div style={{ display: 'grid', gap: '20px' }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <strong style={{ fontSize: '14px', color: '#374151' }}>Visibility</strong>
                                <button
                                    onClick={() => setShowClient(!showClient)}
                                    style={{ padding: '10px', width: '100%', background: showClient ? '#eff6ff' : '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '6px', color: showClient ? '#2563eb' : '#374151', cursor: 'pointer' }}
                                >
                                    {showClient ? 'Hide Client' : 'Show Client'}
                                </button>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <strong style={{ fontSize: '14px', color: '#374151' }}>Mode</strong>
                                <select
                                    value={uiMode}
                                    onChange={(e) => setUiMode(e.target.value as any)}
                                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="modal">Modal</option>
                                    <option value="fullscreen">Fullscreen</option>
                                </select>
                            </label>

                            {uiMode === 'modal' && (
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <strong style={{ fontSize: '14px', color: '#374151' }}>Position</strong>
                                    <select
                                        value={uiPosition}
                                        onChange={(e) => setUiPosition(e.target.value as any)}
                                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                    >
                                        <option value="bottom-right">Bottom Right</option>
                                        <option value="bottom-left">Bottom Left</option>
                                        <option value="center">Center</option>
                                    </select>
                                </label>
                            )}

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <strong style={{ fontSize: '14px', color: '#374151' }}>Theme</strong>
                                <select
                                    value={uiTheme}
                                    onChange={(e) => setUiTheme(e.target.value as any)}
                                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                >
                                    <option value="auto">Auto (System)</option>
                                    <option value="light">Light</option>
                                    <option value="dark">Dark</option>
                                </select>
                            </label>

                            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <strong style={{ fontSize: '14px', color: '#374151' }}>Title</strong>
                                <input
                                    type="text"
                                    value={customTitle}
                                    onChange={(e) => setCustomTitle(e.target.value)}
                                    placeholder="Component Title"
                                    style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </label>

                            {uiMode === 'modal' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <strong style={{ fontSize: '14px', color: '#374151' }}>Width (px)</strong>
                                        <input
                                            type="text"
                                            value={customWidth}
                                            onChange={(e) => setCustomWidth(e.target.value)}
                                            placeholder="e.g. 400px"
                                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <strong style={{ fontSize: '14px', color: '#374151' }}>Height (px)</strong>
                                        <input
                                            type="text"
                                            value={customHeight}
                                            onChange={(e) => setCustomHeight(e.target.value)}
                                            placeholder="e.g. 600px"
                                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {showClient && (
                    <VoiceClientUI
                        mode={uiMode}
                        position={uiPosition}
                        theme={uiTheme}
                        title={customTitle}
                        width={customWidth}
                        height={customHeight}
                        onClose={() => setShowClient(false)}
                    />
                )}
            </div>
        </LukeProvider>
    );
}

export default App;
