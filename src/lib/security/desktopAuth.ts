/**
 * SUSI Desktop Control Authentication & Authorization Engine
 * Protects local OS control endpoints against unauthorized local processes,
 * external web pages, and cross-origin attacks.
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';

// In-memory active session token (regenerated per server restart or loaded from environment)
let ACTIVE_SERVER_SECRET = process.env.SUSI_DESKTOP_SECRET || '';

if (!ACTIVE_SERVER_SECRET) {
  // Generate a cryptographically secure 256-bit ephemeral secret on boot
  ACTIVE_SERVER_SECRET = crypto.randomBytes(32).toString('hex');
}

export const DESKTOP_AUTH_HEADER = 'x-susi-desktop-auth';
export const DESKTOP_AUTH_COOKIE = 'susi_desktop_auth_token';

/**
 * Returns the active server secret (server-side only)
 */
export function getActiveServerSecret(): string {
  return ACTIVE_SERVER_SECRET;
}

/**
 * Validates whether an incoming request possesses authorized desktop control credentials.
 */
export function validateDesktopAuth(req: NextRequest): { authorized: boolean; reason?: string } {
  // 1. Check header
  const authHeader = req.headers.get(DESKTOP_AUTH_HEADER) || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  
  // 2. Check cookie fallback
  const authCookie = req.cookies.get(DESKTOP_AUTH_COOKIE)?.value;

  const providedToken = authHeader || authCookie;

  if (!providedToken) {
    return {
      authorized: false,
      reason: 'Unauthorized: Missing required desktop authorization token in request header or cookie.',
    };
  }

  // Constant-time comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(ACTIVE_SERVER_SECRET);
    const providedBuf = Buffer.from(providedToken);

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
      return {
        authorized: false,
        reason: 'Unauthorized: Invalid desktop control token provided.',
      };
    }
  } catch {
    return {
      authorized: false,
      reason: 'Unauthorized: Failed token verification.',
    };
  }

  return { authorized: true };
}

