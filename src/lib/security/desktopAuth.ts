/**
 * SUSI Desktop Control Authentication & Authorization Engine
 * 
 * Provides:
 * 1. Cryptographic Desktop Bootstrap with user-isolated local file storage.
 * 2. Scoped, ephemeral session management with 1-hour expiry.
 * 3. Session revocation capability.
 * 4. Replay attack prevention via timestamp window and cryptographic nonces.
 * 5. Strict rejection of arbitrary local processes lacking genuine desktop bootstrap proof.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// -----------------------------------------------------------------------------
// 1. BOOTSTRAP TOKEN (Generated per server lifecycle, written to protected file)
// -----------------------------------------------------------------------------

const SUSI_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), '.susi');
const BOOTSTRAP_TOKEN_FILE = path.join(SUSI_DIR, 'desktop_bootstrap.token');

let BOOTSTRAP_SECRET = process.env.SUSI_BOOTSTRAP_SECRET || '';

function initializeBootstrapSecret(): string {
  if (BOOTSTRAP_SECRET) return BOOTSTRAP_SECRET;

  try {
    if (!fs.existsSync(SUSI_DIR)) {
      fs.mkdirSync(SUSI_DIR, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(BOOTSTRAP_TOKEN_FILE)) {
      const existing = fs.readFileSync(BOOTSTRAP_TOKEN_FILE, 'utf8').trim();
      if (existing.length === 64) {
        BOOTSTRAP_SECRET = existing;
        return existing;
      }
    }

    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(BOOTSTRAP_TOKEN_FILE, secret, { encoding: 'utf8', mode: 0o600 });
    BOOTSTRAP_SECRET = secret;
    return secret;
  } catch (err) {
    console.warn('[DesktopAuth] Failed to write bootstrap token file, using ephemeral in-memory secret:', err);
    BOOTSTRAP_SECRET = crypto.randomBytes(32).toString('hex');
    return BOOTSTRAP_SECRET;
  }
}

// Initialize on module load
BOOTSTRAP_SECRET = initializeBootstrapSecret();

export const DESKTOP_AUTH_HEADER = 'x-susi-desktop-auth';
export const DESKTOP_AUTH_COOKIE = 'susi_desktop_auth_token';
export const DESKTOP_NONCE_HEADER = 'x-susi-nonce';
export const DESKTOP_TIMESTAMP_HEADER = 'x-susi-timestamp';

/**
 * Returns the bootstrap secret for genuine desktop bootstrap callers (server-side only)
 */
export function getBootstrapToken(): string {
  if (!BOOTSTRAP_SECRET) {
    BOOTSTRAP_SECRET = initializeBootstrapSecret();
  }
  return BOOTSTRAP_SECRET;
}

// -----------------------------------------------------------------------------
// 2. ACTIVE SESSIONS REPOSITORY
// -----------------------------------------------------------------------------

export interface DesktopSession {
  sessionId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  usedNonces: Set<string>;
}

// In-memory store of active authorized desktop sessions
const activeSessions = new Map<string, DesktopSession>();
const revokedTokens = new Set<string>();

// Default session lifespan: 1 hour (3600 seconds)
const SESSION_LIFESPAN_MS = 60 * 60 * 1000;
// Maximum allowed clock skew for replay protection: 30 seconds
const MAX_TIMESTAMP_SKEW_MS = 30 * 1000;

/**
 * Creates a new authenticated desktop session if the bootstrap proof is valid.
 */
export function createDesktopSession(bootstrapToken: string): {
  success: boolean;
  session?: { sessionId: string; token: string; expiresAt: number };
  error?: string;
  code?: string;
} {
  if (!bootstrapToken || typeof bootstrapToken !== 'string') {
    return {
      success: false,
      error: 'Unauthorized: Missing required desktop bootstrap proof.',
      code: 'MISSING_BOOTSTRAP_TOKEN',
    };
  }

  // Constant-time comparison to prevent timing side-channel attacks
  try {
    const expectedBuf = Buffer.from(BOOTSTRAP_SECRET);
    const providedBuf = Buffer.from(bootstrapToken);

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return {
        success: false,
        error: 'Unauthorized: Invalid desktop bootstrap token.',
        code: 'INVALID_BOOTSTRAP_TOKEN',
      };
    }
  } catch {
    return {
      success: false,
      error: 'Unauthorized: Verification failure.',
      code: 'VERIFICATION_FAILURE',
    };
  }

  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_LIFESPAN_MS;

  const session: DesktopSession = {
    sessionId,
    token: sessionToken,
    createdAt: now,
    expiresAt,
    revoked: false,
    usedNonces: new Set(),
  };

  activeSessions.set(sessionToken, session);

  return {
    success: true,
    session: {
      sessionId,
      token: sessionToken,
      expiresAt,
    },
  };
}

/**
 * Revokes an existing desktop session.
 */
export function revokeDesktopSession(sessionToken: string): boolean {
  revokedTokens.add(sessionToken);
  const session = activeSessions.get(sessionToken);
  if (session) {
    session.revoked = true;
    activeSessions.delete(sessionToken);
  }
  return true;
}

/**
 * Validates whether an incoming request possesses a valid, active, unexpired,
 * and unrevoked desktop session token with replay protection.
 */
export function validateDesktopAuth(req: NextRequest): {
  authorized: boolean;
  reason?: string;
  code?: string;
  sessionId?: string;
} {
  // 1. Check header
  const authHeader = req.headers.get(DESKTOP_AUTH_HEADER) || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  
  // 2. Check cookie fallback
  const authCookie = req.cookies.get(DESKTOP_AUTH_COOKIE)?.value;

  const providedToken = authHeader || authCookie;

  if (!providedToken) {
    return {
      authorized: false,
      reason: 'Unauthorized: Missing required desktop authorization token in request header or cookie.',
      code: 'MISSING_AUTH_TOKEN',
    };
  }

  // Check revocation set
  if (revokedTokens.has(providedToken)) {
    return {
      authorized: false,
      reason: 'Unauthorized: Desktop session has been revoked.',
      code: 'SESSION_REVOKED',
    };
  }

  const session = activeSessions.get(providedToken);
  if (!session) {
    return {
      authorized: false,
      reason: 'Unauthorized: Invalid or unknown desktop session token.',
      code: 'INVALID_SESSION_TOKEN',
    };
  }

  // Check revocation
  if (session.revoked) {
    return {
      authorized: false,
      reason: 'Unauthorized: Desktop session has been revoked.',
      code: 'SESSION_REVOKED',
    };
  }

  // Check expiration
  const now = Date.now();
  if (now > session.expiresAt) {
    activeSessions.delete(providedToken);
    return {
      authorized: false,
      reason: 'Unauthorized: Desktop session has expired.',
      code: 'SESSION_EXPIRED',
    };
  }

  // 3. Replay Protection (Nonce & Timestamp Validation)
  // Both headers are mandatory. Accepting a session token without them would
  // silently downgrade every protected endpoint to replayable bearer auth.
  const timestampHeader = req.headers.get(DESKTOP_TIMESTAMP_HEADER);
  const nonceHeader = req.headers.get(DESKTOP_NONCE_HEADER);

  if (!timestampHeader || !nonceHeader) {
    return {
      authorized: false,
      reason: 'Unauthorized: Request timestamp and nonce headers are required.',
      code: 'MISSING_REPLAY_HEADERS',
    };
  }

  const reqTimestamp = Number(timestampHeader);
  if (
    !Number.isSafeInteger(reqTimestamp) ||
    Math.abs(now - reqTimestamp) > MAX_TIMESTAMP_SKEW_MS
  ) {
    return {
      authorized: false,
      reason: 'Unauthorized: Request timestamp is outside the allowable 30-second window (replay check).',
      code: 'REPLAY_WINDOW_EXCEEDED',
    };
  }

  // Keep nonce input bounded and predictable before storing it in session state.
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(nonceHeader)) {
    return {
      authorized: false,
      reason: 'Unauthorized: Request nonce has an invalid format.',
      code: 'INVALID_NONCE',
    };
  }

  if (session.usedNonces.has(nonceHeader)) {
    return {
      authorized: false,
      reason: 'Unauthorized: Replay attack detected. Request nonce has already been consumed.',
      code: 'REPLAY_ATTACK_DETECTED',
    };
  }

  // Never clear the replay cache: doing so would make previously used nonces
  // valid again during the same session. Fail closed at the per-session cap.
  if (session.usedNonces.size >= 5000) {
    return {
      authorized: false,
      reason: 'Unauthorized: Desktop session request limit reached. Re-authenticate to continue.',
      code: 'NONCE_LIMIT_EXCEEDED',
    };
  }

  session.usedNonces.add(nonceHeader);

  return { authorized: true, sessionId: session.sessionId };
}
