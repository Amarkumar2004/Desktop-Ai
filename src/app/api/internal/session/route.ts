import { NextRequest, NextResponse } from 'next/server';
import { getActiveServerSecret, DESKTOP_AUTH_COOKIE } from '@/lib/security/desktopAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || 'localhost:3000';

  if (origin) {
    try {
      const parsed = new URL(origin);
      const isLocal =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        parsed.protocol === 'tauri:' ||
        parsed.hostname === 'tauri.localhost';

      if (!isLocal && parsed.host !== host) {
        return NextResponse.json({ success: false, error: 'Forbidden origin' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid origin header' }, { status: 403 });
    }
  }

  const token = getActiveServerSecret();
  const response = NextResponse.json({ success: true, token });

  // Set SameSite=Strict cookie for browser sessions
  response.cookies.set({
    name: DESKTOP_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });

  return response;
}

