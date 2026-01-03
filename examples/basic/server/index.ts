// Express server with @luke/server integration
// Runs the Luke WebSocket server alongside a REST API

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createLukeServer, openai, gemini, z } from '@luke/server';

const app = express();
app.use(cors());
app.use(express.json());

// REST endpoint to get a demo auth token
app.post('/api/auth', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    // Create a simple base64 "JWT" for demo purposes
    // In production, use a proper JWT library
    const payload = {
        sub: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    const token = Buffer.from(JSON.stringify(payload)).toString('base64');

    res.json({ token });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', providers: getAvailableProviders() });
});

function getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (process.env.OPENAI_API_KEY) providers.push('openai');
    if (process.env.GEMINI_API_KEY) providers.push('gemini');
    return providers;
}

// Create Luke server with configured providers
const lukeServer = createLukeServer({
    providers: [
        ...(process.env.OPENAI_API_KEY
            ? [openai({ apiKey: process.env.OPENAI_API_KEY })]
            : []),
        ...(process.env.GEMINI_API_KEY
            ? [gemini({ apiKey: process.env.GEMINI_API_KEY })]
            : []),
    ],

    auth: {
        // Simple base64 token validation for demo (no JWT secret needed)
        validate: async (decoded) => {
            // Token is passed as { token: "base64string" } when no JWT secret is set
            const rawToken = decoded.token as string;
            if (!rawToken) return null;

            try {
                // Decode the base64 token
                const payload = JSON.parse(Buffer.from(rawToken, 'base64').toString('utf-8'));

                const sub = payload.sub as string;
                if (!sub) return null;

                // Check expiration
                const exp = payload.exp as number;
                if (exp && exp < Date.now() / 1000) return null;

                return { userId: sub };
            } catch {
                return null;
            }
        },
    },

    session: {
        create: async (user, provider) => {
            const session = {
                id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                userId: user.userId,
                provider: provider.name,
                startedAt: new Date(),
            };
            console.log(`[Session] Created: ${session.id} for user ${user.userId}`);
            return session;
        },
        onEnd: async (session, reason) => {
            console.log(`[Session] Ended: ${session.id} - ${reason}`);
        },
    },

    config: {
        systemInstruction: `You are Luke, a friendly AI voice assistant. 
Keep your responses concise and conversational.`,
        transcription: { input: true, output: true },
        // Tools disabled for now - requires proper JSON schema generation
        // tools: [...],
    },

    onConnect: (session, user) => {
        console.log(`[Connect] User ${user.userId} connected`);
    },

    onTranscription: (transcription, session) => {
        const prefix = transcription.role === 'user' ? 'User' : 'Luke';
        console.log(`[${session.id}] ${prefix}: ${transcription.text}`);
    },
});

// Start servers
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// Express listens on PORT+1 for REST API
const expressServer = app.listen(PORT + 1, () => {
    console.log(`REST API: http://localhost:${PORT + 1}/api`);
});

// Luke WebSocket server on main PORT
lukeServer.listen(PORT, () => {
    console.log(`WebSocket: ws://localhost:${PORT}`);
    console.log('');
    console.log('Available providers:', getAvailableProviders().join(', ') || 'none');
    console.log('');
    if (getAvailableProviders().length === 0) {
        console.log('Set environment variables:');
        console.log('  OPENAI_API_KEY=sk-... for OpenAI Realtime');
        console.log('  GEMINI_API_KEY=AIza... for Gemini Live');
        console.log('');
    }
});
