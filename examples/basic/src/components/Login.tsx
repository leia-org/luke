import { useState } from 'react';
import './Login.css';

interface LoginProps {
    onLogin: (username: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
    const [username, setUsername] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            onLogin(username.trim());
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>Luke</h1>
                    <p>Voice AI Assistant</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="input-group">
                        <label htmlFor="username">Enter your name</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="John Doe"
                            autoFocus
                        />
                    </div>

                    <button type="submit" className="login-btn" disabled={!username.trim()}>
                        Start Chatting
                    </button>
                </form>

                <div className="login-footer">
                    <p>Make sure the server is running on port 3001</p>
                </div>
            </div>
        </div>
    );
}
