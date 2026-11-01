import { NextRequest, NextResponse } from 'next/server';
import {
  createDesktopSession,
  revokeDesktopSession,
  DESKTOP_AUTH_COOKIE,
  DESKTOP_AUTH_HEADER,
} from '@/lib/security/desktopAuth';
import { auditLogger } from '@/lib/security/auditLogger';

export const dynamic = 'force-dynamic';

function isAllowedOrigin(origin: string | null, host: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const isLocal =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.protocol === 'tauri:' ||
      parsed.hostname === 'tauri.localhost';

    return isLocal || parsed.host === host;
  } catch {
    return false;
  }
}

/**
 * Reject unauthenticated GET requests to eliminate accidental credential leakage.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Method Not Allowed: Desktop session establishment requires an authenticated POST request with bootstrap proof.',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}

/**
 * POST /api/internal/session
 * Establishes an authorized, ephemeral desktop session.
 * Requires:
 * 1. Valid local Origin or verified local process credentials.
 * 2. Cryptographic bootstrap token proof.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || 'localhost:3000';
  const secFetchSite = req.headers.get('sec-fetch-site');

  // Prevent cross-site requests
  if (secFetchSite === 'cross-site') {
    auditLogger.log({
      requestId: `session_${Date.now()}`,
      actionType: 'SESSION_HANDSHAKE_BLOCKED',
      target: 'CSRF_CROSS_SITE',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: { success: false, message: 'Cross-site session request blocked.' },
    });
    return NextResponse.json(
      { success: false, error: 'Cross-site request blocked by security policy.', code: 'FORBIDDEN_ORIGIN' },
      { status: 403 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Malformed JSON payload.', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  // Handle Session Revocation
  if (body.action === 'revoke') {
    const token =
      String(body.token || '') ||
      req.headers.get(DESKTOP_AUTH_HEADER) ||
      req.cookies.get(DESKTOP_AUTH_COOKIE)?.value ||
      '';

    if (token) {
      revokeDesktopSession(token);
    }

    const res = NextResponse.json({ success: true, message: 'Desktop session revoked successfully.' });
    res.cookies.delete(DESKTOP_AUTH_COOKIE);
    return res;
  }

  // Bootstrap Token Check
  const bootstrapToken = String(
    body.bootstrapToken || req.headers.get('x-susi-bootstrap-token') || ''
  ).trim();

  if (!bootstrapToken) {
    auditLogger.log({
      requestId: `session_${Date.now()}`,
      actionType: 'SESSION_HANDSHAKE_FAILED',
      target: 'MISSING_BOOTSTRAP_TOKEN',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: { success: false, message: 'Missing bootstrap token proof' },
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Missing required desktop bootstrap proof.',
        code: 'MISSING_BOOTSTRAP_TOKEN',
      },
      { status: 401 }
    );
  }

  // Validate Origin if present
  if (origin && !isAllowedOrigin(origin, host)) {
    auditLogger.log({
      requestId: `session_${Date.now()}`,
      actionType: 'SESSION_HANDSHAKE_FAILED',
      target: 'UNTRUSTED_ORIGIN',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: { success: false, message: `Untrusted origin ${origin}` },
    });
    return NextResponse.json(
      { success: false, error: `Forbidden: Untrusted origin "${origin}".`, code: 'FORBIDDEN_ORIGIN' },
      { status: 403 }
    );
  }

  // Create Authenticated Session
  const sessionResult = createDesktopSession(bootstrapToken);
  if (!sessionResult.success || !sessionResult.session) {
    auditLogger.log({
      requestId: `session_${Date.now()}`,
      actionType: 'SESSION_HANDSHAKE_FAILED',
      target: 'INVALID_BOOTSTRAP_TOKEN',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: { success: false, message: sessionResult.error || 'Invalid token' },
    });
    return NextResponse.json(
      { success: false, error: sessionResult.error, code: sessionResult.code },
      { status: 401 }
    );
  }

  const { sessionId, token, expiresAt } = sessionResult.session;

  auditLogger.log({
    requestId: `session_${Date.now()}`,
    actionType: 'SESSION_ESTABLISHED',
    target: sessionId,
    riskLevel: 'LOW',
    status: 'APPROVED',
    executionResult: { success: true, message: `Session established (expires: ${new Date(expiresAt).toISOString()})` },
  });

  const response = NextResponse.json({
    success: true,
    sessionId,
    token,
    expiresAt,
  });

  // Set SameSite=Strict HttpOnly session cookie
  response.cookies.set({
    name: DESKTOP_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 3600, // 1 hour
  });

  return response;
}
