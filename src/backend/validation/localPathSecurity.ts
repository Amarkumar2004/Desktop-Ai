/**
 * Local Path Security & Scope Validator
 * Enforces strict sandboxing rules for local filesystem requests.
 * Completely blocks directory traversal, system folders, credentials, and sensitive configs.
 */

export interface PathValidationResult {
  isValid: boolean;
  sanitizedPath?: string;
  rejectionReason?: string;
}

// Forbidden file extensions (secrets, private keys, compiled binaries)
const FORBIDDEN_EXTENSIONS = [
  '.pem',
  '.key',
  '.pfx',
  '.p12',
  '.crt',
  '.cer',
  '.id_rsa',
  '.id_ed25519',
  '.exe',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.vbs',
  '.dll',
];

// Forbidden folder segments or exact filenames
const FORBIDDEN_PATTERNS = [
  '.git',
  '.ssh',
  '.aws',
  '.azure',
  '.gcp',
  '.kube',
  '.gnupg',
  'node_modules',
  'secrets',
  'credentials',
  '.env',
];

// Forbidden system root and OS prefixes
const FORBIDDEN_SYSTEM_PATHS = [
  '/etc',
  '/var',
  '/usr',
  '/bin',
  '/sbin',
  '/root',
  '/dev',
  '/proc',
  '/sys',
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\system volume information',
  'c:\\recovery',
];

/**
 * Validates a relative file path within a scoped folder.
 */
export function validateScopedRelativePath(relativePath: string): PathValidationResult {
  if (!relativePath || typeof relativePath !== 'string') {
    return { isValid: false, rejectionReason: 'Path must be a non-empty string.' };
  }

  const normalized = relativePath.trim().replace(/\\/g, '/');

  // 1. Block empty or root references
  if (normalized === '' || normalized === '.' || normalized === '/') {
    return { isValid: false, rejectionReason: 'Cannot target the folder root directly.' };
  }

  // 2. Block absolute paths (Unix and Windows drive letters or UNC shares)
  if (
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/i.test(normalized) ||
    normalized.startsWith('//') ||
    normalized.startsWith('\\\\')
  ) {
    return {
      isValid: false,
      rejectionReason: 'Absolute paths are prohibited. Path must be relative to the scoped project folder.',
    };
  }

  // 3. Block path traversal attempts (../, ..\, %2e%2e, etc.)
  const segments = normalized.split('/');
  for (const seg of segments) {
    const cleanSeg = decodeURIComponent(seg).trim();
    if (cleanSeg === '..' || cleanSeg === '.' || cleanSeg.includes('..')) {
      return {
        isValid: false,
        rejectionReason: 'Path traversal (..) is strictly prohibited.',
      };
    }
  }

  // 4. Check for forbidden folder names and sensitive files (.env, .git, node_modules, etc.)
  const lowerNormalized = normalized.toLowerCase();
  for (const pattern of FORBIDDEN_PATTERNS) {
    const isExactMatch = segments.some((s) => s.toLowerCase() === pattern);
    const startsWithEnv = segments.some((s) => s.toLowerCase().startsWith('.env'));
    if (isExactMatch || startsWithEnv || lowerNormalized.includes(`/${pattern}/`)) {
      return {
        isValid: false,
        rejectionReason: `Access to "${pattern}" or environment credential files is strictly prohibited.`,
      };
    }
  }

  // 5. Block forbidden file extensions (private keys, certificates, scripts)
  for (const ext of FORBIDDEN_EXTENSIONS) {
    if (lowerNormalized.endsWith(ext) || lowerNormalized.includes(`${ext}/`)) {
      return {
        isValid: false,
        rejectionReason: `Files with extension "${ext}" are restricted for security.`,
      };
    }
  }

  // 6. Check system path signatures
  for (const sysPath of FORBIDDEN_SYSTEM_PATHS) {
    if (lowerNormalized.startsWith(sysPath) || lowerNormalized.includes(sysPath)) {
      return {
        isValid: false,
        rejectionReason: 'System OS directories are restricted.',
      };
    }
  }

  return {
    isValid: true,
    sanitizedPath: segments.join('/'),
  };
}

/**
 * Validates a browser URL for safe opening (URL scheme allowlist).
 */
export function validateBrowserUrl(rawUrl: string): { isValid: boolean; sanitizedUrl?: string; error?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'URL must be a non-empty string.' };
  }

  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        isValid: false,
        error: 'Only standard web protocols (https://, http://) are permitted.',
      };
    }

    // Prohibit localhost/internal network addresses from arbitrary browser launcher
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.endsWith('.local')
    ) {
      return {
        isValid: false,
        error: 'Internal and private IP addresses cannot be opened via local browser launcher.',
      };
    }

    return { isValid: true, sanitizedUrl: parsed.toString() };
  } catch {
    return { isValid: false, error: 'Invalid URL format.' };
  }
}
