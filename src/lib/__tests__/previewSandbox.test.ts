import { describe, it, expect } from 'vitest';
import {
  isUiPreviewSupported,
  generateSafeSandboxHtml,
} from '../codeAssistant/previewSandbox';
import type { ProposedFile } from '@/types/codeAssistant';

describe('Code Assistant Safe Preview Sandbox', () => {
  it('returns false for null/undefined file', () => {
    expect(isUiPreviewSupported(null).isSupported).toBe(false);
    expect(isUiPreviewSupported(undefined).isSupported).toBe(false);
  });

  it('returns false for backend file extensions and types', () => {
    const sqlFile: ProposedFile = {
      name: 'schema.sql',
      path: 'supabase/migrations/01_schema.sql',
      language: 'sql',
      code: 'CREATE TABLE users (id uuid PRIMARY KEY);',
      description: 'Database schema',
    };
    const pyFile: ProposedFile = {
      name: 'agent.py',
      path: 'scripts/agent.py',
      language: 'python',
      code: 'import os\nprint("hello")',
      description: 'Python script',
    };
    const mdFile: ProposedFile = {
      name: 'RLS.md',
      path: 'docs/RLS.md',
      language: 'markdown',
      code: '# RLS Documentation',
      description: 'Docs',
    };
    const serverFile: ProposedFile = {
      name: 'server.ts',
      path: 'src/lib/supabase/server.ts',
      language: 'typescript',
      code: 'export async function createClient() { return null; }',
      description: 'Server client',
    };
    const rateLimiterFile: ProposedFile = {
      name: 'rateLimiter.ts',
      path: 'src/backend/utils/rateLimiter.ts',
      language: 'typescript',
      code: 'export class TokenBucket { private capacity = 60; }',
      description: 'Rate limiter',
    };

    expect(isUiPreviewSupported(sqlFile).isSupported).toBe(false);
    expect(isUiPreviewSupported(pyFile).isSupported).toBe(false);
    expect(isUiPreviewSupported(mdFile).isSupported).toBe(false);
    expect(isUiPreviewSupported(serverFile).isSupported).toBe(false);
    expect(isUiPreviewSupported(rateLimiterFile).isSupported).toBe(false);
    expect(isUiPreviewSupported(serverFile).reason || '').toMatch(
      /Live preview is available for UI code/
    );
  });

  it('returns true for UI frontend components and HTML templates', () => {
    const loginFile: ProposedFile = {
      name: 'LoginForm.tsx',
      path: 'src/components/auth/LoginForm.tsx',
      language: 'tsx',
      code: `'use client'; export default function LoginForm() { return <form><input type="email" /></form>; }`,
      description: 'Login form component',
    };
    const htmlFile: ProposedFile = {
      name: 'index.html',
      path: 'public/index.html',
      language: 'html',
      code: '<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>',
      description: 'HTML markup',
    };

    expect(isUiPreviewSupported(loginFile).isSupported).toBe(true);
    expect(isUiPreviewSupported(htmlFile).isSupported).toBe(true);
  });

  it('generates HTML containing strict CSP and network lockdown scripts', () => {
    const file: ProposedFile = {
      name: 'LoginForm.tsx',
      path: 'src/components/auth/LoginForm.tsx',
      language: 'tsx',
      code: `'use client'; export default function LoginForm() { return <div>Login</div>; }`,
      description: 'Login component',
    };

    const html = generateSafeSandboxHtml(file);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain('window.fetch = function()');
    expect(html).toContain('window.XMLHttpRequest = function()');
    expect(html).toContain('localStorage');
    expect(html).toContain('sessionStorage');
    expect(html).toContain('cookie');
  });

  it('generates login UI markup with email/password fields for LoginForm', () => {
    const file: ProposedFile = {
      name: 'LoginForm.tsx',
      path: 'src/components/auth/LoginForm.tsx',
      language: 'tsx',
      code: `export default function LoginForm() { return <form><input type="password" /></form>; }`,
      description: 'Login form',
    };

    const html = generateSafeSandboxHtml(file);
    expect(html).toContain('Welcome back');
    expect(html).toContain('Work Email');
    expect(html).toContain('Password');
    expect(html).toContain('Sign in');
    expect(html).toContain('Remember me');
    expect(html).toContain('toggle-pw-btn');
  });
});
