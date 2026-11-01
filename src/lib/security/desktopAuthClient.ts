/**
 * SUSI Desktop Control Session Client
 * Securely maintains ephemeral session credentials in memory (never written to localStorage or logs)
 * and signs local desktop OS control requests with timestamp and replay-prevention nonces.
 */

let cachedSessionToken: string | null = null;
let sessionExpiresAt: number = 0;
let handshakePromise: Promise<string | null> | null = null;

function generateRandomNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Retrieves the bootstrap token required to prove desktop authenticity.
 */
async function acquireBootstrapProof(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 1. Check if running inside native Tauri runtime
  try {
    const tauri = (window as any).__TAURI__;
    if (tauri?.invoke) {
      const token = await tauri.invoke('get_desktop_bootstrap_token');
      if (typeof token === 'string' && token.length > 0) {
        return token;
      }
    }
  } catch (err) {
    console.warn('[DesktopAuthClient] Tauri bootstrap query notice:', err);
  }

  // 2. Check window-injected bootstrap variable (injected securely during webview initialization)
  const injected = (window as any).__SUSI_BOOTSTRAP_TOKEN__;
  if (typeof injected === 'string' && injected.length > 0) {
    return injected;
  }

  return null;
}

/**
 * Performs authenticated session handshake with the local desktop API.
 */
export async function getDesktopAuthToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedSessionToken && now < sessionExpiresAt - 30000) {
    return cachedSessionToken;
  }

  if (typeof window === 'undefined') return null;

  if (handshakePromise) {
    return handshakePromise;
  }

  handshakePromise = (async () => {
    try {
      const bootstrapProof = await acquireBootstrapProof();
      if (!bootstrapProof) {
        return null;
      }

      const res = await fetch('/api/internal/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({ bootstrapToken: bootstrapProof }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.token) {
          cachedSessionToken = data.token;
          sessionExpiresAt = data.expiresAt || Date.now() + 3600000;
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

/**
 * Revokes the active desktop session upon logout or shutdown.
 */
export async function revokeCurrentSession(): Promise<boolean> {
  if (!cachedSessionToken) return true;
  try {
    await fetch('/api/internal/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', token: cachedSessionToken }),
    });
  } catch {
    // Ignore network error on shutdown
  } finally {
    cachedSessionToken = null;
    sessionExpiresAt = 0;
  }
  return true;
}

/**
 * Wrapper for authorized desktop API requests with anti-replay headers.
 */
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
  headers.set('x-susi-timestamp', Date.now().toString());
  headers.set('x-susi-nonce', generateRandomNonce());

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}
