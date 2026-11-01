import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createDesktopSession,
  revokeDesktopSession,
  validateDesktopAuth,
  getBootstrapToken,
  DESKTOP_AUTH_HEADER,
  DESKTOP_NONCE_HEADER,
  DESKTOP_TIMESTAMP_HEADER,
} from '@/lib/security/desktopAuth';
import { GET as sessionGET, POST as sessionPOST } from '@/app/api/internal/session/route';

describe('Desktop Authentication & Session Security (P0 Verification)', () => {
  const bootstrapToken = getBootstrapToken();

  it('1. GET /api/internal/session returns 405 Method Not Allowed (No Secret Exposure)', async () => {
    const res = await sessionGET();
    const data = await res.json();
    expect(res.status).toBe(405);
    expect(data.success).toBe(false);
    expect(data.code).toBe('METHOD_NOT_ALLOWED');
    expect(data.token).toBeUndefined(); // Secret must NOT be exposed
  });

  it('2. POST /api/internal/session rejects request without bootstrap token proof', async () => {
    const req = new NextRequest('http://localhost:3000/api/internal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await sessionPOST(req);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.code).toBe('MISSING_BOOTSTRAP_TOKEN');
  });

  it('3. POST /api/internal/session rejects request with invalid bootstrap token', async () => {
    const req = new NextRequest('http://localhost:3000/api/internal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bootstrapToken: 'invalid_fake_token_1234567890' }),
    });
    const res = await sessionPOST(req);
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.code).toBe('INVALID_BOOTSTRAP_TOKEN');
  });

  it('4. POST /api/internal/session blocks cross-site and untrusted origin requests', async () => {
    const req = new NextRequest('http://localhost:3000/api/internal/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://malicious-website.com',
      },
      body: JSON.stringify({ bootstrapToken }),
    });
    const res = await sessionPOST(req);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.success).toBe(false);
    expect(data.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('5. POST /api/internal/session establishes an ephemeral session with 1-hour expiry', async () => {
    const req = new NextRequest('http://localhost:3000/api/internal/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ bootstrapToken }),
    });
    const res = await sessionPOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBe(64); // 256-bit hex session token
    expect(typeof data.sessionId).toBe('string');
    expect(data.expiresAt).toBeGreaterThan(Date.now() + 3500000); // ~1 hour in future
    // Verify master bootstrap secret is NOT returned
    expect(data.token).not.toBe(bootstrapToken);
  });

  it('6. Validates legitimate session token successfully', async () => {
    const sessionRes = createDesktopSession(bootstrapToken);
    expect(sessionRes.success).toBe(true);
    const sessionToken = sessionRes.session!.token;

    const req = new NextRequest('http://localhost:3000/api/local/action', {
      method: 'POST',
      headers: {
        [DESKTOP_AUTH_HEADER]: sessionToken,
      },
    });

    const validation = validateDesktopAuth(req);
    expect(validation.authorized).toBe(true);
  });

  it('7. Rejects revoked session tokens immediately', async () => {
    const sessionRes = createDesktopSession(bootstrapToken);
    const sessionToken = sessionRes.session!.token;

    revokeDesktopSession(sessionToken);

    const req = new NextRequest('http://localhost:3000/api/local/action', {
      method: 'POST',
      headers: {
        [DESKTOP_AUTH_HEADER]: sessionToken,
      },
    });

    const validation = validateDesktopAuth(req);
    expect(validation.authorized).toBe(false);
    expect(validation.code).toBe('SESSION_REVOKED');
  });

  it('8. Replay Protection: Rejects duplicate request nonces', async () => {
    const sessionRes = createDesktopSession(bootstrapToken);
    const sessionToken = sessionRes.session!.token;
    const testNonce = `nonce_${Date.now()}_abc123`;
    const testTimestamp = Date.now().toString();

    const req1 = new NextRequest('http://localhost:3000/api/local/action', {
      method: 'POST',
      headers: {
        [DESKTOP_AUTH_HEADER]: sessionToken,
        [DESKTOP_NONCE_HEADER]: testNonce,
        [DESKTOP_TIMESTAMP_HEADER]: testTimestamp,
      },
    });

    const firstCheck = validateDesktopAuth(req1);
    expect(firstCheck.authorized).toBe(true);

    // Replay with identical nonce
    const req2 = new NextRequest('http://localhost:3000/api/local/action', {
      method: 'POST',
      headers: {
        [DESKTOP_AUTH_HEADER]: sessionToken,
        [DESKTOP_NONCE_HEADER]: testNonce,
        [DESKTOP_TIMESTAMP_HEADER]: testTimestamp,
      },
    });

    const replayCheck = validateDesktopAuth(req2);
    expect(replayCheck.authorized).toBe(false);
    expect(replayCheck.code).toBe('REPLAY_ATTACK_DETECTED');
  });

  it('9. Replay Protection: Rejects request with timestamp skewed beyond 30 seconds', async () => {
    const sessionRes = createDesktopSession(bootstrapToken);
    const sessionToken = sessionRes.session!.token;
    const staleTimestamp = (Date.now() - 45000).toString(); // 45 seconds old

    const req = new NextRequest('http://localhost:3000/api/local/action', {
      method: 'POST',
      headers: {
        [DESKTOP_AUTH_HEADER]: sessionToken,
        [DESKTOP_NONCE_HEADER]: 'nonce_test_stale',
        [DESKTOP_TIMESTAMP_HEADER]: staleTimestamp,
      },
    });

    const check = validateDesktopAuth(req);
    expect(check.authorized).toBe(false);
    expect(check.code).toBe('REPLAY_WINDOW_EXCEEDED');
  });
});

