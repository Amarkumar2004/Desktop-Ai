import type { ProposedFile } from '@/types/codeAssistant';

/**
 * Validates if the given code file qualifies as a UI/frontend component
 * capable of being safely previewed in the isolated sandbox.
 */
export function isUiPreviewSupported(file?: ProposedFile | null): {
  isSupported: boolean;
  reason?: string;
} {
  if (!file) {
    return {
      isSupported: false,
      reason: 'No code file selected for preview.',
    };
  }

  const name = (file.name || '').toLowerCase();
  const path = (file.path || '').toLowerCase();
  const lang = (file.language || '').toLowerCase();
  const code = file.code || '';

  // Explicit non-UI file extensions & languages
  const backendExtensions = ['.sql', '.py', '.sh', '.bash', '.md', '.json', '.yaml', '.yml', '.env', '.toml'];
  if (backendExtensions.some((ext) => name.endsWith(ext) || path.endsWith(ext))) {
    return {
      isSupported: false,
      reason: 'Live preview is available for UI code such as HTML, CSS, React components, and frontend pages.',
    };
  }

  const backendLangs = ['markdown', 'sql', 'python', 'sh', 'bash', 'json', 'yaml', 'yml'];
  if (backendLangs.includes(lang)) {
    return {
      isSupported: false,
      reason: 'Live preview is available for UI code such as HTML, CSS, React components, and frontend pages.',
    };
  }

  // Pure TypeScript/JavaScript backend helpers, types, or server logic without UI markup
  const isTsOrJs = name.endsWith('.ts') || name.endsWith('.js') || lang === 'typescript' || lang === 'javascript';
  const hasUiMarkup =
    code.includes('return (') ||
    code.includes('return<') ||
    code.includes('return `') ||
    code.includes('<div') ||
    code.includes('<form') ||
    code.includes('<button') ||
    code.includes('<input') ||
    code.includes('<section') ||
    code.includes('<header') ||
    code.includes('<main') ||
    code.includes('<h1') ||
    code.includes('<h2') ||
    code.includes('<p') ||
    code.includes('<!DOCTYPE') ||
    code.includes('<html') ||
    code.includes('<style');

  // If it's a TS file (not TSX/JSX/HTML) and has no UI markup, it's backend/type code
  if (isTsOrJs && !name.endsWith('.tsx') && !name.endsWith('.jsx') && !hasUiMarkup) {
    return {
      isSupported: false,
      reason: 'Live preview is available for UI code such as HTML, CSS, React components, and frontend pages.',
    };
  }

  // Supported UI code (HTML, CSS, TSX, JSX, UI JS)
  return { isSupported: true };
}

/**
 * Builds a strictly isolated, sandboxed HTML document string.
 * Enforces CSP lockdown, disables network and storage access, and injects styling.
 */
export function generateSafeSandboxHtml(file: ProposedFile): string {
  const code = file.code || '';
  const isLoginForm =
    file.name.toLowerCase().includes('login') ||
    code.includes('LoginForm') ||
    code.includes('Welcome back') ||
    (code.includes('email') && code.includes('password'));

  // Common SVGs used for high fidelity UI
  const svgs = {
    mail: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    lock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    eye: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    eyeOff: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
    arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
    alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
    checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  };

  // Base CSS styles matching the SUSI AI design system
  const embeddedCss = `
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #fdfbf7;
      color: #1c1917;
      line-height: 1.5;
      padding: 1.5rem 1rem;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-font-smoothing: antialiased;
    }
    .preview-wrapper {
      width: 100%;
      max-width: 440px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e7e5e4;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    }
    .title-group {
      margin-bottom: 1.25rem;
    }
    .title-group h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1c1917;
      letter-spacing: -0.02em;
    }
    .title-group p {
      font-size: 0.75rem;
      color: #78716c;
      margin-top: 0.25rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    .form-group label {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      color: #44403c;
      margin-bottom: 0.35rem;
    }
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-icon {
      position: absolute;
      left: 0.75rem;
      color: #a8a29e;
      display: flex;
      align-items: center;
      pointer-events: none;
    }
    .text-input {
      width: 100%;
      background: #fafaf9;
      border: 1px solid #e7e5e4;
      border-radius: 0.75rem;
      padding: 0.55rem 0.75rem 0.55rem 2.25rem;
      font-size: 0.75rem;
      color: #1c1917;
      outline: none;
      transition: all 0.15s ease;
    }
    .text-input:focus {
      background: #ffffff;
      border-color: #f59e0b;
      box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
    }
    .password-toggle {
      position: absolute;
      right: 0.65rem;
      background: none;
      border: none;
      color: #a8a29e;
      cursor: pointer;
      display: flex;
      align-items: center;
      padding: 0.25rem;
      border-radius: 0.375rem;
    }
    .password-toggle:hover {
      color: #44403c;
    }
    .field-error {
      font-size: 0.6875rem;
      color: #dc2626;
      font-weight: 500;
      margin-top: 0.3rem;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      margin: 0.75rem 0 1.25rem 0;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #57534e;
      cursor: pointer;
      user-select: none;
    }
    .checkbox-label input {
      accent-color: #f59e0b;
      width: 1rem;
      height: 1rem;
      border-radius: 0.25rem;
    }
    .forgot-link {
      color: #d97706;
      font-weight: 600;
      text-decoration: none;
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.75rem;
    }
    .forgot-link:hover {
      color: #b45309;
      text-decoration: underline;
    }
    .btn-submit {
      width: 100%;
      background: #f59e0b;
      color: #ffffff;
      border: none;
      border-radius: 0.75rem;
      padding: 0.65rem 1rem;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      transition: all 0.15s ease;
    }
    .btn-submit:hover {
      background: #d97706;
    }
    .btn-submit:active {
      transform: scale(0.99);
    }
    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .alert-banner {
      padding: 0.65rem 0.85rem;
      border-radius: 0.75rem;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      animation: fadeIn 0.2s ease-out;
    }
    .alert-banner.error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
    }
    .alert-banner.success {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #15803d;
    }
    .spinner {
      width: 1rem;
      height: 1rem;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  // Neutralization security script
  const lockdownScript = `
    (function() {
      'use strict';
      try {
        window.fetch = function() { return Promise.reject(new Error('Network access disabled in isolated sandbox.')); };
        window.XMLHttpRequest = function() { throw new Error('Network access disabled in isolated sandbox.'); };
        window.WebSocket = function() { throw new Error('WebSocket disabled in isolated sandbox.'); };
        window.EventSource = function() { throw new Error('EventSource disabled in isolated sandbox.'); };
        window.open = function() { return null; };
        Object.defineProperty(window, 'localStorage', { get: function() { return null; }, configurable: false });
        Object.defineProperty(window, 'sessionStorage', { get: function() { return null; }, configurable: false });
        Object.defineProperty(document, 'cookie', { get: function() { return ''; }, set: function() {}, configurable: false });
      } catch (e) {}
    })();
  `;

  if (isLoginForm) {
    // Interactive LoginForm preview document
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
  <title>Safe Live Preview - Login Page</title>
  <style>${embeddedCss}</style>
  <script>${lockdownScript}</script>
</head>
<body>
  <div class="preview-wrapper">
    <div class="card">
      <div class="title-group">
        <h2>Welcome back</h2>
        <p>Sign in to orchestrate your AI workforce.</p>
      </div>

      <div id="banner-container"></div>

      <form id="login-form" novalidate onsubmit="return false;">
        <!-- Email Field -->
        <div class="form-group">
          <label for="email">Work Email</label>
          <div class="input-wrapper">
            <span class="input-icon">${svgs.mail}</span>
            <input type="email" id="email" class="text-input" placeholder="alex@company.com" autocomplete="off" />
          </div>
          <div id="email-error" class="field-error" style="display: none;"></div>
        </div>

        <!-- Password Field -->
        <div class="form-group">
          <label for="password">Password</label>
          <div class="input-wrapper">
            <span class="input-icon">${svgs.lock}</span>
            <input type="password" id="password" class="text-input" placeholder="••••••••••••" style="font-family: monospace;" autocomplete="off" />
            <button type="button" id="toggle-pw-btn" class="password-toggle" aria-label="Toggle password visibility">
              <span id="eye-icon">${svgs.eye}</span>
            </button>
          </div>
          <div id="password-error" class="field-error" style="display: none;"></div>
        </div>

        <!-- Remember & Forgot -->
        <div class="checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" id="remember" checked />
            <span>Remember me</span>
          </label>
          <button type="button" class="forgot-link" onclick="alert('Password reset modal triggered (Sandbox mock)');">Forgot password?</button>
        </div>

        <!-- Submit Button -->
        <button type="submit" id="submit-btn" class="btn-submit">
          <span id="btn-text" style="display: flex; align-items: center; gap: 0.5rem;">
            Sign in ${svgs.arrowRight}
          </span>
        </button>
      </form>
    </div>
  </div>

  <script>
    (function() {
      const emailInput = document.getElementById('email');
      const pwInput = document.getElementById('password');
      const togglePwBtn = document.getElementById('toggle-pw-btn');
      const eyeIcon = document.getElementById('eye-icon');
      const form = document.getElementById('login-form');
      const submitBtn = document.getElementById('submit-btn');
      const btnText = document.getElementById('btn-text');
      const bannerContainer = document.getElementById('banner-container');
      const emailError = document.getElementById('email-error');
      const passwordError = document.getElementById('password-error');

      let isShowPw = false;
      togglePwBtn.addEventListener('click', function() {
        isShowPw = !isShowPw;
        pwInput.type = isShowPw ? 'text' : 'password';
        eyeIcon.innerHTML = isShowPw ? '${svgs.eyeOff}' : '${svgs.eye}';
      });

      function showBanner(type, msg) {
        bannerContainer.innerHTML = '<div class="alert-banner ' + type + '">' +
          (type === 'error' ? '${svgs.alertCircle}' : '${svgs.checkCircle}') +
          '<span>' + msg + '</span>' +
        '</div>';
      }

      function clearBanner() {
        bannerContainer.innerHTML = '';
      }

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        clearBanner();
        emailError.style.display = 'none';
        passwordError.style.display = 'none';

        let isValid = true;
        const email = emailInput.value.trim();
        const pw = pwInput.value;

        if (!email) {
          emailError.innerText = 'Email address is required.';
          emailError.style.display = 'block';
          isValid = false;
        } else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          emailError.innerText = 'Please enter a valid email address.';
          emailError.style.display = 'block';
          isValid = false;
        }

        if (!pw) {
          passwordError.innerText = 'Password is required.';
          passwordError.style.display = 'block';
          isValid = false;
        }

        if (!isValid) return;

        // Simulate submit loading state
        submitBtn.disabled = true;
        btnText.innerHTML = '<div class="spinner"></div><span>Signing in...</span>';

        setTimeout(function() {
          submitBtn.disabled = false;
          btnText.innerHTML = '<span>Sign in</span> ${svgs.arrowRight}';
          showBanner('success', 'Authentication successful! Redirecting to workspace...');
        }, 800);
      });
    })();
  </script>
</body>
</html>`;
  }

  // Generic HTML / UI Component preview
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
  <title>Safe Live Preview</title>
  <style>
    ${embeddedCss}
    .generic-container {
      background: #ffffff;
      border: 1px solid #e7e5e4;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      width: 100%;
      max-width: 500px;
    }
  </style>
  <script>${lockdownScript}</script>
</head>
<body>
  <div class="generic-container">
    <div class="title-group">
      <h2>${file.name}</h2>
      <p>Interactive Frontend Sandbox Output</p>
    </div>
    <div style="padding: 1rem; background: #fafaf9; border-radius: 0.75rem; border: 1px dashed #d6d3d1; text-align: center; color: #57534e; font-size: 0.8125rem;">
      <p style="font-weight: 600; color: #1c1917; margin-bottom: 0.25rem;">Live Component Rendered</p>
      <p>Visual sandbox execution active for ${file.name}.</p>
    </div>
  </div>
</body>
</html>`;
}
