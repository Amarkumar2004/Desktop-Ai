/**
 * SUSI Desktop Control Session Client
 * Securely maintains ephemeral token in memory (never written to localStorage or logs)
 * and signs local desktop OS control requests.
 */

let cachedToken: string | null = null;
let handshakePromise: Promise<string | null> | null = null;

export async function getDesktopAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (typeof window === 'undefined') return null;

  if (handshakePromise) {
    return handshakePromise;
  }

  handshakePromise = (async () => {
    try {
      const res = await fetch('/api/internal/session', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.token) {
          cachedToken = data.token;
          return data.token;
        }
      }
    } catch (err) {
      console.warn('[DesktopAuthClient] Session handshake notice:', err);
    } finally {
      handshakePromise = null;
    }
    return null;
  })();

  return handshakePromise;
}

export async function fetchWithDesktopAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getDesktopAuthToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('x-susi-desktop-auth', token);
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

