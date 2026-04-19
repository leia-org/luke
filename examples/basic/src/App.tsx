import { useState, useEffect, useMemo, useRef } from 'react';
import { LukeProvider, VoiceClientUI } from '@leia-org/luke-client';
import Editor, { type Monaco } from '@monaco-editor/react';
import Login from './components/Login';
import './App.css';

interface ToolModal {
    title: string;
    body: string;
}

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

    // State driven by the frontend tools
    const [modal, setModal] = useState<ToolModal | null>(null);
    const editorRef = useRef<{ getValue: () => string } | null>(null);
    const [editorValue, setEditorValue] = useState<string>(
        '// Ask Luke "read the editor" and it will call getEditorContent()\nfunction hello() {\n    return "Luke can see this code";\n}\n'
    );

    // Tool handlers that will run in the browser.
    const tools = useMemo(() => ({
        openModal: {
            description: 'Opens a modal dialog in the user\'s browser with a given title and body text. Use this to show information or confirmations.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Modal heading' },
                    body: { type: 'string', description: 'Body text (can be multi-line)' },
                },
                required: ['title', 'body'],
            },
            execute: async (args: Record<string, unknown>) => {
                const title = String(args.title ?? '');
                const body = String(args.body ?? '');
                setModal({ title, body });
                return { shown: true };
            },
        },
        getEditorContent: {
            description: 'Reads the current text inside the in-page Monaco code editor and returns it as a string.',
            parameters: { type: 'object', properties: {} },
            execute: async () => {
                const content = editorRef.current?.getValue() ?? '';
                return { content };
            },
        },
    }), []);

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
        <LukeProvider
            serverUrl="ws://localhost:3001"
            authToken={token}
            // Enable client-side local storage backup
            // Server-side history is automatically handled if sent by server
            persistence={true}
            tools={tools}
        >
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

                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
                        <h2 style={{ marginTop: 0, fontSize: '18px', color: '#1f2937', marginBottom: '12px' }}>Playground editor</h2>
                        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#6b7280' }}>
                            Tell Luke "read the editor and summarise it" — it will call the frontend tool <code>getEditorContent()</code>.
                        </p>
                        <div style={{ border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
                            <Editor
                                height="220px"
                                defaultLanguage="javascript"
                                value={editorValue}
                                onChange={(v) => setEditorValue(v ?? '')}
                                onMount={(editor: any, _monaco: Monaco) => { editorRef.current = editor; }}
                                options={{ minimap: { enabled: false }, fontSize: 13 }}
                            />
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

                {modal && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                    }} onClick={() => setModal(null)}>
                        <div onClick={(e) => e.stopPropagation()} style={{
                            background: 'white', borderRadius: '12px', padding: '24px',
                            maxWidth: '500px', width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        }}>
                            <h2 style={{ marginTop: 0, fontSize: '20px', color: '#1f2937' }}>{modal.title}</h2>
                            <p style={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{modal.body}</p>
                            <button onClick={() => setModal(null)} style={{
                                padding: '10px 20px', background: '#2563eb', color: 'white',
                                border: 'none', borderRadius: '6px', cursor: 'pointer',
                            }}>Close</button>
                        </div>
                    </div>
                )}

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
