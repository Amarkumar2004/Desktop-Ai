/**
 * SUSI AI — Credential & Secret Scrubber Service
 * 
 * Provides robust regex and structural sanitization to guarantee that API keys,
 * bearer tokens, passwords, private keys, and sensitive metadata never leak into
 * logs, errors, database persistence, agent messages, or memory.
 */

// Regex patterns for specific high-value provider credentials
const PATTERNS = [
  // Multiline PEM Private Keys
  {
    pattern: /-----BEGIN [A-Z\s*]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z\s*]+ PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  // Anthropic API Keys (sk-ant-...) - Must precede OpenAI to prevent prefix clash
  {
    pattern: /\bsk-ant-(?:api[0-9]{2}-)?[a-zA-Z0-9_\-]{20,}\b/g,
    replacement: '[REDACTED_ANTHROPIC_KEY]',
  },
  // OpenAI API Keys (legacy sk-... and project sk-proj-...)
  {
    pattern: /\bsk-(?!ant-)(?:proj-)?[a-zA-Z0-9_\-]{20,}\b/g,
    replacement: '[REDACTED_OPENAI_KEY]',
  },
  // Google Gemini / Cloud API Keys (AIza...)
  {
    pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    replacement: '[REDACTED_GEMINI_KEY]',
  },
  // GitHub Personal Access & OAuth Tokens (ghp_, gho_, ghu_, ghs_, github_pat_...)
  {
    pattern: /\b(?:gh[pours]_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{22,})\b/g,
    replacement: '[REDACTED_GITHUB_KEY]',
  },
  // HTTP Bearer Authorization Tokens
  {
    pattern: /\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  // Key-value pairs: password, secret, apiKey, token, etc. in prose, queries, or configs
  // Fixes the capture group replacement bug by preserving the key and assignment operator
  {
    pattern: /(\b(?:password|secret|api_?key|auth_?token|access_?token|private_?key|client_?secret)\b)(\s*[:=]\s*["']?)([^"'\r\n,}\]]+)(["']?)/gi,
    replacement: '$1$2[REDACTED]$4',
  },
];

/**
 * Scrubs credentials and secrets from a raw string.
 */
export function scrubSensitiveString(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let sanitized = text;
  for (const { pattern, replacement } of PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

/**
 * Recursively sanitizes any JavaScript value (objects, arrays, strings, errors).
 */
export function scrubSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return scrubSensitiveString(input) as unknown as T;
  }

  if (input instanceof Error) {
    const scrubbedError = new Error(scrubSensitiveString(input.message));
    scrubbedError.name = input.name;
    if (input.stack) {
      scrubbedError.stack = scrubSensitiveString(input.stack);
    }
    return scrubbedError as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => scrubSensitiveData(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      // If the object key itself is sensitive, redact value immediately
      const isSensitiveKey = /^(password|secret|api_?key|auth_?token|access_?token|private_?key|client_?secret)$/i.test(key);
      if (isSensitiveKey && typeof value === 'string') {
        result[key] = '[REDACTED]';
      } else {
        result[key] = scrubSensitiveData(value);
      }
    }
    return result as unknown as T;
  }

  return input;
}
