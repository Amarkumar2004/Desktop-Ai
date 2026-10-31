import { describe, it, expect, beforeEach, vi } from 'vitest';
import { permissionManager } from '../permissionManager';
import { ActionClassifier } from '../actionClassifier';
import { SecurityValidator } from '../securityValidator';
import { ApprovalService } from '../approvalService';
import { auditLogger } from '../auditLogger';
import { ToolExecutor } from '@/lib/voice/ToolExecutor';

describe('Advanced PC Permission & Action Approval System', () => {
  beforeEach(() => {
    auditLogger.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. ACTION CLASSIFICATION & RISK TIERS
  // ---------------------------------------------------------------------------
  describe('Action Classification (3 Tiers)', () => {
    it('classifies read-only/navigational operations as LOW RISK (Auto-executed)', () => {
      const tabRes = ActionClassifier.classify('NAVIGATE_TAB', { tab: 'code' });
      expect(tabRes.riskLevel).toBe('LOW');
      expect(tabRes.requiresApproval).toBe(false);

      const urlRes = ActionClassifier.classify('OPEN_URL', { url: 'https://github.com' });
      expect(urlRes.riskLevel).toBe('LOW');
      expect(urlRes.requiresApproval).toBe(false);

      const sysRes = ActionClassifier.classify('SYSTEM_INFO', {});
      expect(sysRes.riskLevel).toBe('LOW');
      expect(sysRes.requiresApproval).toBe(false);
    });

    it('classifies file deletion as MEDIUM RISK with Recycle Bin reversibility', () => {
      const delRes = ActionClassifier.classify('DELETE_FILE', {
        filename: 'src/components/OldComponent.tsx',
        fileSize: '14.2 KB',
      });
      expect(delRes.riskLevel).toBe('MEDIUM');
      expect(delRes.requiresApproval).toBe(true);
      expect(delRes.isReversible).toBe(true);
      expect(delRes.voicePromptHi).toContain('Recycle Bin');
    });

    it('classifies package install and terminal commands as MEDIUM RISK', () => {
      const pkgRes = ActionClassifier.classify('INSTALL_PACKAGE', { target: 'lodash' });
      expect(pkgRes.riskLevel).toBe('MEDIUM');
      expect(pkgRes.requiresApproval).toBe(true);

      const cmdRes = ActionClassifier.classify('EXECUTE_COMMAND', { command: 'npm run test' });
      expect(cmdRes.riskLevel).toBe('MEDIUM');
      expect(cmdRes.requiresApproval).toBe(true);
    });

    it('classifies registry tampering or system file modifications as HIGH RISK', () => {
      const regRes = ActionClassifier.classify('REGISTRY_MODIFY', { target: 'HKLM\\SYSTEM\\Setup' });
      expect(regRes.riskLevel).toBe('HIGH');
      expect(regRes.requiresApproval).toBe(true);
      expect(regRes.isReversible).toBe(false);

      const sysPathRes = ActionClassifier.classify('DELETE_FILE', { target: 'C:\\Windows\\System32\\hal.dll' });
      expect(sysPathRes.riskLevel).toBe('HIGH');
      expect(sysPathRes.isBlocked).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SECURITY VALIDATOR: DANGEROUS PATHS & COMMANDS
  // ---------------------------------------------------------------------------
  describe('Security Validator', () => {
    it('blocks dangerous Windows system paths', () => {
      expect(SecurityValidator.isDangerousPath('C:\\Windows\\System32\\drivers\\etc\\hosts').dangerous).toBe(true);
      expect(SecurityValidator.isDangerousPath('C:\\System Volume Information').dangerous).toBe(true);
      expect(SecurityValidator.isDangerousPath('D:\\projects\\ai\\src\\App.tsx').dangerous).toBe(false);
    });

    it('blocks destructive terminal commands', () => {
      expect(SecurityValidator.inspectCommand('format C:').safe).toBe(false);
      expect(SecurityValidator.inspectCommand('rmdir /s /q C:\\').safe).toBe(false);
      expect(SecurityValidator.inspectCommand('Set-MpPreference -DisableRealtimeMonitoring $true').safe).toBe(false);
      expect(SecurityValidator.inspectCommand('netsh advfirewall set allprofiles state off').safe).toBe(false);
      expect(SecurityValidator.inspectCommand('reg add HKLM\\... /v ConsentPromptBehaviorAdmin /t REG_DWORD /d 0').safe).toBe(false);

      // Safe commands
      expect(SecurityValidator.inspectCommand('npm run build').safe).toBe(true);
      expect(SecurityValidator.inspectCommand('git status').safe).toBe(true);
    });

    it('scrubs API keys, tokens, and passwords from logs', () => {
      const dirty = 'Error with key=AIzaSyD9x87_334589201948572019485 and Bearer eyJhbGciOiJIUzI1NiJ9.test and password="mySecretPassword123"';
      const scrubbed = SecurityValidator.scrubSecrets(dirty);

      expect(scrubbed).not.toContain('AIzaSyD9x87_334589201948572019485');
      expect(scrubbed).not.toContain('eyJhbGciOiJIUzI1NiJ9.test');
      expect(scrubbed).not.toContain('mySecretPassword123');
      expect(scrubbed).toContain('***KEY_SCRUBBED***');
      expect(scrubbed).toContain('***TOKEN_SCRUBBED***');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PERMISSION WORKFLOW: ALLOW, DENY, EXPIRE, REPLAY PROTECTION
  // ---------------------------------------------------------------------------
  describe('Permission Manager Lifecycle', () => {
    it('auto-approves LOW RISK operations immediately', async () => {
      const res = await permissionManager.requestPermission({
        actionType: 'NAVIGATE_TAB',
        target: 'code',
      });
      expect(res.approved).toBe(true);
      expect(res.request.status).toBe('APPROVED');
      expect(res.request.approvedByChannel).toBe('AUTO');
    });

    it('allows approval via Desktop GUI', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'DELETE_FILE',
        target: 'src/scratch/temp.log',
      });

      const active = permissionManager.getActiveRequest();
      expect(active).not.toBeNull();
      expect(active?.actionType).toBe('DELETE_FILE');

      // User clicks ALLOW in Desktop GUI
      const resolved = ApprovalService.approveByGui(active!.id);
      expect(resolved).toBe(true);

      const result = await requestPromise;
      expect(result.approved).toBe(true);
      expect(result.request.status).toBe('APPROVED');
      expect(result.request.approvedByChannel).toBe('GUI');
    });

    it('allows denial via Chat interface', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'INSTALL_PACKAGE',
        target: 'express',
      });

      const active = permissionManager.getActiveRequest();
      expect(active).not.toBeNull();

      // User clicks DENY in Chat
      const resolved = ApprovalService.denyByChat(active!.id);
      expect(resolved).toBe(true);

      const result = await requestPromise;
      expect(result.approved).toBe(false);
      expect(result.request.status).toBe('DENIED');
    });

    it('auto-expires with status EXPIRED and defaults to DENY on timeout', async () => {
      vi.useFakeTimers();

      const requestPromise = permissionManager.requestPermission({
        actionType: 'DELETE_FOLDER',
        target: 'build_output',
        customTimeoutMs: 1000, // 1 second timeout
      });

      // Fast-forward past timeout
      vi.advanceTimersByTime(1500);

      const result = await requestPromise;
      expect(result.approved).toBe(false);
      expect(result.request.status).toBe('EXPIRED');

      vi.useRealTimers();
    });

    it('blocks duplicate approvals / replay of consumed requests', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'MODIFY_FILE',
        target: 'config.json',
      });

      const active = permissionManager.getActiveRequest();
      const reqId = active!.id;

      // First resolution succeeds
      ApprovalService.approveByGui(reqId);
      await requestPromise;

      // Second attempt with same ID is blocked
      const replayAttempt = ApprovalService.approveByGui(reqId);
      expect(replayAttempt).toBe(false);
    });

    it('rejects invalid or non-existent approval ID', () => {
      const invalid = ApprovalService.approveByGui('perm_req_fake_invalid_id');
      expect(invalid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. VOICE APPROVAL SYNCHRONIZATION (HINDI & ENGLISH)
  // ---------------------------------------------------------------------------
  describe('Voice Approval & Noise Rejection', () => {
    it('approves on affirmative voice responses in Hindi ("haan", "kar do")', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'DELETE_FILE',
        target: 'sample.txt',
      });

      // Spoken voice transcript in Hindi
      const voiceResult = ApprovalService.handleVoiceInput('haan bhai kar do');
      expect(voiceResult.handled).toBe(true);
      expect(voiceResult.decision).toBe('APPROVED');

      const outcome = await requestPromise;
      expect(outcome.approved).toBe(true);
      expect(outcome.request.approvedByChannel).toBe('VOICE');
    });

    it('approves on affirmative voice responses in English ("yes", "allow")', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'EXECUTE_COMMAND',
        target: 'npm test',
      });

      const voiceResult = ApprovalService.handleVoiceInput('yes please allow it');
      expect(voiceResult.handled).toBe(true);
      expect(voiceResult.decision).toBe('APPROVED');

      const outcome = await requestPromise;
      expect(outcome.approved).toBe(true);
    });

    it('denies on negative voice responses ("nahi", "deny", "cancel", "mat karo")', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'DELETE_FILE',
        target: 'important.db',
      });

      const voiceResult = ApprovalService.handleVoiceInput('nahi mat karo cancel');
      expect(voiceResult.handled).toBe(true);
      expect(voiceResult.decision).toBe('DENIED');

      const outcome = await requestPromise;
      expect(outcome.approved).toBe(false);
      expect(outcome.request.status).toBe('DENIED');
    });

    it('ignores background audio, silence, or unrelated conversation without approving', async () => {
      const requestPromise = permissionManager.requestPermission({
        actionType: 'DELETE_FILE',
        target: 'production.env',
      });

      // Ambient talk or question that is neither yes nor no
      const noise1 = ApprovalService.handleVoiceInput('aaj mausam kaisa hai');
      expect(noise1.handled).toBe(false);

      const noise2 = ApprovalService.handleVoiceInput('what is the capital of France');
      expect(noise2.handled).toBe(false);

      const noise3 = ApprovalService.handleVoiceInput('     ');
      expect(noise3.handled).toBe(false);

      // Request remains active and unapproved
      expect(permissionManager.getActiveRequest()?.status).toBe('PENDING');

      // Now explicit denial cancels it
      ApprovalService.handleVoiceInput('nahi');
      const finalResult = await requestPromise;
      expect(finalResult.approved).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. AUDIT LOGGING INTEGRITY
  // ---------------------------------------------------------------------------
  describe('Audit Logger', () => {
    it('records timestamp, risk level, channel, and sanitized targets', () => {
      auditLogger.log({
        requestId: 'req_123',
        actionType: 'DELETE_FILE',
        target: 'src/temp.txt?token=secretToken12345',
        riskLevel: 'MEDIUM',
        status: 'APPROVED',
        channel: 'VOICE',
        executionResult: {
          success: true,
          message: 'Moved to Windows Recycle Bin successfully.',
        },
      });

      const logs = auditLogger.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].actionType).toBe('DELETE_FILE');
      expect(logs[0].status).toBe('APPROVED');
      expect(logs[0].channel).toBe('VOICE');
      expect(logs[0].target).not.toContain('secretToken12345');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. TOOL EXECUTOR INTEGRATION
  // ---------------------------------------------------------------------------
  describe('ToolExecutor Integration with Permission Gate', () => {
    const executor = new ToolExecutor();

    it('blocks dangerous terminal commands outright before requesting permission', async () => {
      const result = await executor.execute('EXECUTE_COMMAND', {
        command: 'rmdir /s /q C:\\',
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain('Command Blocked');
    });

    it('cancels file deletion if user denies permission', async () => {
      const execPromise = executor.execute('DELETE_FILE', {
        filename: 'src/generated/demo.txt',
      });

      // Simulate denial
      setTimeout(() => {
        const active = permissionManager.getActiveRequest();
        if (active) {
          ApprovalService.denyByGui(active.id);
        }
      }, 50);

      const result = await execPromise;
      expect(result.success).toBe(false);
      expect(result.message).toContain('Action cancelled');
    });

    it('classifies OPEN_APP as LOW risk and launches without modal', () => {
      const classification = ActionClassifier.classify('OPEN_APP', { appName: 'chrome' });
      expect(classification.riskLevel).toBe('LOW');
      expect(classification.requiresApproval).toBe(false);
    });
  });
});
