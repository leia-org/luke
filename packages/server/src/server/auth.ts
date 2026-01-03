// Authentication utilities
// Handles JWT validation and custom auth callbacks

import type { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import type { AuthConfig } from '../types.js';

// Extracts auth token from request (Authorization header or query param)
function extractToken(req: IncomingMessage): string | null {
    // Check Authorization header first
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7);
    }

    // Fallback to query parameter
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    return url.searchParams.get('token');
}

// Verifies a JWT token using the provided secret
function verifyJwt(
    token: string,
    secret: string,
    algorithms?: jwt.Algorithm[]
): jwt.JwtPayload | null {
    try {
        const decoded = jwt.verify(token, secret, {
            algorithms: algorithms ?? ['HS256'],
        });

        if (typeof decoded === 'string') {
            return null;
        }

        return decoded;
    } catch {
        return null;
    }
}

// Authenticates a WebSocket upgrade request
export async function authenticate<TUser>(
    req: IncomingMessage,
    authConfig: AuthConfig<TUser>
): Promise<TUser | null> {
    const token = extractToken(req);
    if (!token) return null;

    let decoded: Record<string, unknown> = {};

    if (authConfig.jwt) {
        // Verify and decode JWT
        const payload = verifyJwt(
            token,
            authConfig.jwt.secret,
            authConfig.jwt.algorithms as jwt.Algorithm[] | undefined
        );

        if (!payload) return null;
        decoded = payload as Record<string, unknown>;
    } else {
        // No JWT config, pass the raw token for custom handling
        decoded = { token };
    }

    // Run custom validation callback
    return authConfig.validate(decoded, req);
}
