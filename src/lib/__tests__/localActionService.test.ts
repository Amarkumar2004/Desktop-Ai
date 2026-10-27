import { describe, it, expect } from 'vitest';
import {
  validateScopedRelativePath,
  validateBrowserUrl,
} from '../../backend/validation/localPathSecurity';
import {
  LocalActionService,
  localActionService,
} from '../../backend/services/localActionService';

describe('Local Path & Security Validator', () => {
  it('rejects path traversal attempts', () => {
    expect(validateScopedRelativePath('../secret.txt').isValid).toBe(false);
    expect(validateScopedRelativePath('src/../../etc/passwd').isValid).toBe(false);
    expect(validateScopedRelativePath('..\\windows\\system32').isValid).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(validateScopedRelativePath('/etc/hosts').isValid).toBe(false);
    expect(validateScopedRelativePath('C:\\Windows\\System32').isValid).toBe(false);
    expect(validateScopedRelativePath('D:/projects/app.env').isValid).toBe(false);
  });

  it('rejects sensitive files and credential folders', () => {
    expect(validateScopedRelativePath('.env').isValid).toBe(false);
    expect(validateScopedRelativePath('.env.local').isValid).toBe(false);
    expect(validateScopedRelativePath('config/.env.production').isValid).toBe(false);
    expect(validateScopedRelativePath('.git/config').isValid).toBe(false);
    expect(validateScopedRelativePath('node_modules/package/index.js').isValid).toBe(false);
    expect(validateScopedRelativePath('.ssh/id_rsa').isValid).toBe(false);
    expect(validateScopedRelativePath('keys/server.pem').isValid).toBe(false);
    expect(validateScopedRelativePath('secrets/token.key').isValid).toBe(false);
  });

  it('accepts valid relative project paths', () => {
    const res1 = validateScopedRelativePath('src/components/Header.tsx');
    expect(res1.isValid).toBe(true);
    expect(res1.sanitizedPath).toBe('src/components/Header.tsx');

    const res2 = validateScopedRelativePath('docs/guide.md');
    expect(res2.isValid).toBe(true);
  });

  it('validates browser URLs securely', () => {
    expect(validateBrowserUrl('https://google.com').isValid).toBe(true);
    expect(validateBrowserUrl('https://www.youtube.com/results?search_query=nextjs').isValid).toBe(true);
    expect(validateBrowserUrl('http://localhost:3000').isValid).toBe(false);
    expect(validateBrowserUrl('file:///C:/secrets.txt').isValid).toBe(false);
    expect(validateBrowserUrl('javascript:alert(1)').isValid).toBe(false);
  });
});

describe('Local Action Service (Platform Abstraction)', () => {
  const service = new LocalActionService();

  it('all platform capabilities default to denied', async () => {
    const caps = await service.getPlatformCapabilities();
    expect(caps.select_project_folder).toBe('denied');
    expect(caps.read_project_files).toBe('denied');
    expect(caps.write_project_files).toBe('denied');
    expect(caps.delete_project_files).toBe('denied');
    expect(caps.create_project_folders).toBe('denied');
    expect(caps.open_browser_url).toBe('denied');
    expect(caps.open_youtube_search).toBe('denied');
    expect(caps.show_desktop_notification).toBe('denied');
    expect(caps.prepare_message_draft).toBe('denied');
    expect(caps.send_approved_message).toBe('denied');
  });

  it('local operations return Desktop app required in web mode', async () => {
    const folderRes = await service.selectProjectFolder();
    expect(folderRes.success).toBe(false);
    expect(folderRes.error).toBe('Desktop app required');
    expect(folderRes.code).toBe('DESKTOP_APP_REQUIRED');

    const readRes = await service.readProjectFiles({ folderId: 'f1', relativePath: 'src/index.ts' });
    expect(readRes.success).toBe(false);
    expect(readRes.error).toBe('Desktop app required');

    const deleteRes = await service.deleteProjectFiles({ folderId: 'f1', relativePath: 'temp.log' });
    expect(deleteRes.success).toBe(false);
    expect(deleteRes.error).toBe('Desktop app required');

    const notifRes = await service.showDesktopNotification({ title: 'Hi', body: 'Test' });
    expect(notifRes.success).toBe(false);
    expect(notifRes.error).toBe('Desktop app required');
  });

  it('generates, validates, and consumes single-use approval tokens', async () => {
    const apprRes = await service.requestLocalActionApproval(
      'write_project_files',
      'my-project',
      'Create 2 files',
      'medium',
      { affectedFiles: ['a.txt', 'b.txt'] }
    );

    expect(apprRes.success).toBe(true);
    expect(apprRes.data?.token).toBeDefined();
    expect(apprRes.data?.actionType).toBe('write_project_files');
    expect(apprRes.data?.isConsumed).toBe(false);

    const token = apprRes.data!.token;

    // First consumption succeeds
    const firstCheck = service.validateAndConsumeApproval(token, 'write_project_files');
    expect(firstCheck.valid).toBe(true);
    expect(firstCheck.approval?.isConsumed).toBe(true);

    // Second consumption is rejected (single-use enforcement)
    const secondCheck = service.validateAndConsumeApproval(token, 'write_project_files');
    expect(secondCheck.valid).toBe(false);
    expect(secondCheck.error || '').toMatch(/already been consumed/);
  });
});
