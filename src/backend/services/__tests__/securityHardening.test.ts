import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WorkspaceFileWriter } from '../workspaceFileWriter';
import {
  createAgentRun,
  recordAgentMessage,
  getAgentRun,
  getAgentMessages,
  setInstallationIdForTesting,
  resetLocalStoresForTesting,
  validateInstallationOwnership,
  getVerifiedInstallationId,
} from '../agentRuntimeService';
import { POST, GET, DELETE } from '@/app/api/agents/orchestrate/route';
import { NextRequest } from 'next/server';
import * as taskService from '../taskService';
import { DESKTOP_AUTH_HEADER, createDesktopSession, getBootstrapToken } from '@/lib/security/desktopAuth';

describe('SUSI AI — Final Security Hardening Regression Suite', () => {
  const tempWorkspace = path.join(os.tmpdir(), `susi_security_test_${Date.now()}`);
  const outsideWorkspace = path.join(os.tmpdir(), `susi_outside_target_${Date.now()}`);

  beforeEach(() => {
    vi.restoreAllMocks();
    resetLocalStoresForTesting();
    setInstallationIdForTesting(null);

    // Setup temporary clean workspace directory
    if (!fs.existsSync(tempWorkspace)) {
      fs.mkdirSync(tempWorkspace, { recursive: true });
    }
    if (!fs.existsSync(outsideWorkspace)) {
      fs.mkdirSync(outsideWorkspace, { recursive: true });
    }
  });

  afterEach(() => {
    resetLocalStoresForTesting();
    setInstallationIdForTesting(null);
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
      fs.rmSync(outsideWorkspace, { recursive: true, force: true });
    } catch {}
  });

  // ===========================================================================
  // 1. REMOVE LOCALHOST/ORIGIN AUTHENTICATION BYPASS & CSRF TESTS
  // ===========================================================================
  describe('1. Remove Localhost/Origin Authentication Bypass', () => {
    it('rejects requests with spoofed Host: localhost without valid authentication', async () => {
      const spoofedReq = new NextRequest('http://localhost:3000/api/agents/orchestrate', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
        },
        body: JSON.stringify({ title: 'Spoofed Localhost Task' }),
      });

      const res = await POST(spoofedReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects requests with spoofed Host: 127.0.0.1 without valid authentication', async () => {
      const spoofedReq = new NextRequest('http://127.0.0.1:3000/api/agents/orchestrate', {
        method: 'GET',
        headers: {
          host: '127.0.0.1:3000',
        },
      });

      const res = await GET(spoofedReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects requests with spoofed Tauri origin (tauri://localhost) without valid desktop session', async () => {
      const spoofedReq = new NextRequest('http://localhost:3000/api/agents/orchestrate', {
        method: 'POST',
        headers: {
          origin: 'tauri://localhost',
          host: 'localhost:3000',
        },
        body: JSON.stringify({ title: 'Spoofed Tauri Task' }),
      });

      const res = await POST(spoofedReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('rejects cross-site browser CSRF attacks', async () => {
      const csrfReq = new NextRequest('http://localhost:3000/api/agents/orchestrate', {
        method: 'POST',
        headers: {
          origin: 'https://malicious-website.com',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({ action: 'cancel', taskId: 'target_victim_task' }),
      });

      const res = await POST(csrfReq);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });
  });

  // ===========================================================================
  // 2. ENFORCE OWNERSHIP FOR EVERY CALLER TYPE
  // ===========================================================================
  describe('2. Enforce Ownership for Every Caller Type', () => {
    const bootstrapSecret = getBootstrapToken();
    const sessionResA = createDesktopSession(bootstrapSecret);
    const sessionResB = createDesktopSession(bootstrapSecret);
    const tokenCallerA = sessionResA.session!.token;
    const tokenCallerB = sessionResB.session!.token;
    const callerIdA = `desktop:${sessionResA.session!.sessionId}`;

    it('prevents Caller B from viewing Caller A’s task via taskId', async () => {
      vi.spyOn(taskService, 'getTasks').mockResolvedValue([
        {
          id: 'task_caller_a_123',
          title: 'Private Task of Caller A',
          assignedAgent: 'SUSI',
          priority: 'High',
          category: 'Finance',
          progress: 50,
          completed: false,
          userId: callerIdA,
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/agents/orchestrate?taskId=task_caller_a_123', {
        method: 'GET',
        headers: { [DESKTOP_AUTH_HEADER]: tokenCallerB },
      });

      const res = await GET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('prevents Caller B from viewing Caller A’s agent run and messages via runId', async () => {
      const runId = await createAgentRun('task_caller_a_123', [], callerIdA);

      await recordAgentMessage({
        runId,
        taskId: 'task_caller_a_123',
        fromAgent: 'SUSI',
        toAgent: 'SPY',
        type: 'assignment',
        content: 'Confidential message for Caller A',
      });

      const req = new NextRequest(`http://localhost:3000/api/agents/orchestrate?runId=${runId}`, {
        method: 'GET',
        headers: { [DESKTOP_AUTH_HEADER]: tokenCallerB },
      });

      const res = await GET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
      expect(data.messages).toBeUndefined();
    });

    it('prevents Caller B from cancelling Caller A’s task via POST action cancel', async () => {
      vi.spyOn(taskService, 'getTasks').mockResolvedValue([
        {
          id: 'task_caller_a_123',
          title: 'Private Task of Caller A',
          assignedAgent: 'SUSI',
          priority: 'High',
          category: 'Finance',
          progress: 50,
          completed: false,
          userId: callerIdA,
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/agents/orchestrate', {
        method: 'POST',
        headers: { [DESKTOP_AUTH_HEADER]: tokenCallerB },
        body: JSON.stringify({ action: 'cancel', taskId: 'task_caller_a_123' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('prevents Caller B from cancelling Caller A’s task via DELETE', async () => {
      vi.spyOn(taskService, 'getTasks').mockResolvedValue([
        {
          id: 'task_caller_a_123',
          title: 'Private Task of Caller A',
          assignedAgent: 'SUSI',
          priority: 'High',
          category: 'Finance',
          progress: 50,
          completed: false,
          userId: callerIdA,
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/agents/orchestrate?taskId=task_caller_a_123', {
        method: 'DELETE',
        headers: { [DESKTOP_AUTH_HEADER]: tokenCallerB },
      });

      const res = await DELETE(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('never lets an unknown or missing owner count as permission', async () => {
      vi.spyOn(taskService, 'getTasks').mockResolvedValue([
        {
          id: 'task_unowned',
          title: 'Unowned Task',
          assignedAgent: 'SUSI',
          priority: 'Medium',
          category: 'Operations',
          progress: 0,
          userId: null, // missing owner
        },
      ]);

      const req = new NextRequest('http://localhost:3000/api/agents/orchestrate?taskId=task_unowned', {
        method: 'GET',
        headers: { [DESKTOP_AUTH_HEADER]: tokenCallerA },
      });

      const res = await GET(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });
  });

  // ===========================================================================
  // 3. MANDATORY OVERWRITE APPROVAL IDENTITY & FLOW
  // ===========================================================================
  describe('3. Mandatory Overwrite Approval Identity & Explicit Confirmation Flow', () => {
    const fileWriter = new WorkspaceFileWriter(tempWorkspace);

    it('rejects approval issuance without explicit user confirmation proof', () => {
      expect(() => {
        fileWriter.issueExplicitUserConfirmationApproval({
          taskId: 'task_1',
          filePath: 'config.json',
          userId: 'user_alice',
          explicitUserConfirmed: false, // Must throw
        });
      }).toThrow(/Security violation: Explicit user confirmation is strictly required/i);
    });

    it('rejects approval issuance if userId is missing or empty', () => {
      expect(() => {
        fileWriter.issueExplicitUserConfirmationApproval({
          taskId: 'task_1',
          filePath: 'config.json',
          userId: '',
          explicitUserConfirmed: true,
        });
      }).toThrow(/Security violation: User identity is mandatory/i);
    });

    it('rejects overwriting if execution user identity is missing', async () => {
      const existingFile = path.join(tempWorkspace, 'target_file.txt');
      fs.writeFileSync(existingFile, 'ORIGINAL', 'utf8');

      const approval = fileWriter.issueExplicitUserConfirmationApproval({
        taskId: 'task_1',
        filePath: 'target_file.txt',
        userId: 'user_alice',
        explicitUserConfirmed: true,
      });

      // Attempt write with no execution userId provided
      const res = await fileWriter.writeFile('target_file.txt', 'NEW_DATA', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_1',
        userId: undefined, // Missing execution identity
        trustedApproval: approval,
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Execution user identity is missing or empty');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('ORIGINAL');
    });

    it('rejects overwriting if execution user identity does not match recorded approval identity', async () => {
      const existingFile = path.join(tempWorkspace, 'target_file.txt');
      fs.writeFileSync(existingFile, 'ORIGINAL', 'utf8');

      const approval = fileWriter.issueExplicitUserConfirmationApproval({
        taskId: 'task_1',
        filePath: 'target_file.txt',
        userId: 'user_alice',
        explicitUserConfirmed: true,
      });

      // Execution attempted by user_bob
      const res = await fileWriter.writeFile('target_file.txt', 'ATTACK_DATA', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_1',
        userId: 'user_bob',
        trustedApproval: approval,
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Approval token user mismatch');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('ORIGINAL');
    });

    it('rejects forged approval objects that were never issued by the service', async () => {
      const existingFile = path.join(tempWorkspace, 'target_file.txt');
      fs.writeFileSync(existingFile, 'ORIGINAL', 'utf8');

      const forgedApproval = {
        approvalId: 'appr_forged_99999999',
        userId: 'user_alice',
        taskId: 'task_1',
        filePath: 'target_file.txt',
        operation: 'OVERWRITE' as const,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60000,
        confirmationToken: 'conf_forged_999999',
      };

      const res = await fileWriter.writeFile('target_file.txt', 'ATTACK_DATA', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_1',
        userId: 'user_alice',
        trustedApproval: forgedApproval,
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Approval token is invalid, unrecognized, or has already been consumed');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('ORIGINAL');
    });

    it('succeeds when exact identity, taskId, file path, operation, and fresh token match', async () => {
      const existingFile = path.join(tempWorkspace, 'target_file.txt');
      fs.writeFileSync(existingFile, 'ORIGINAL', 'utf8');

      const approval = fileWriter.issueExplicitUserConfirmationApproval({
        taskId: 'task_1',
        filePath: 'target_file.txt',
        userId: 'user_alice',
        explicitUserConfirmed: true,
      });

      const res = await fileWriter.writeFile('target_file.txt', 'UPDATED_CLEAN', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_1',
        userId: 'user_alice',
        trustedApproval: approval,
      });

      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.operation).toBe('modified');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('UPDATED_CLEAN');
    });
  });

  // ===========================================================================
  // 4. STRONG FILESYSTEM RACE & SYMLINK PROTECTION
  // ===========================================================================
  describe('4. Strong Filesystem Race & Symlink Protection', () => {
    const fileWriter = new WorkspaceFileWriter(tempWorkspace);

    it('fails closed BEFORE modifying external files if target is a symbolic link', async () => {
      const outsideTarget = path.join(outsideWorkspace, 'critical_system_file.txt');
      fs.writeFileSync(outsideTarget, 'CRITICAL_DATA_DO_NOT_TOUCH', 'utf8');

      const symlinkFile = path.join(tempWorkspace, 'symlinked_target.txt');
      try {
        fs.symlinkSync(outsideTarget, symlinkFile, 'file');
      } catch {
        // Skip on environments without symlink privileges
        return;
      }

      const res = await fileWriter.writeFile('symlinked_target.txt', 'COMPROMISED_PAYLOAD', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_attack',
        userId: 'user_alice',
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toMatch(/symbolic link/i);

      // Verify the outside target was NEVER touched
      expect(fs.readFileSync(outsideTarget, 'utf8')).toBe('CRITICAL_DATA_DO_NOT_TOUCH');
    });

    it('fails closed BEFORE staging write if directory component is a symbolic link', async () => {
      const symlinkDir = path.join(tempWorkspace, 'symlink_folder');
      try {
        fs.symlinkSync(outsideWorkspace, symlinkDir, 'junction');
      } catch {
        try {
          fs.symlinkSync(outsideWorkspace, symlinkDir, 'dir');
        } catch {
          return;
        }
      }

      const res = await fileWriter.writeFile('symlink_folder/injected.txt', 'PAYLOAD', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_attack',
        userId: 'user_alice',
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toMatch(/Directory component.*is a symbolic link|outside authorized workspace/i);

      // Verify nothing was written to outside directory
      const outsideInjected = path.join(outsideWorkspace, 'injected.txt');
      expect(fs.existsSync(outsideInjected)).toBe(false);
    });

    it('performs atomic staging write without leaving temporary files behind on success', async () => {
      const res = await fileWriter.writeFile('clean_atomic.txt', 'ATOMIC_PAYLOAD', {
        workspaceRoot: tempWorkspace,
      });

      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);

      // Verify no staging .tmp files remain in workspace
      const files = fs.readdirSync(tempWorkspace);
      const tmpFiles = files.filter((f) => f.includes('__susi_staging'));
      expect(tmpFiles.length).toBe(0);
    });
  });

  // ===========================================================================
  // 5. CROSS-INSTALLATION & LOCAL ISOLATION TESTS
  // ===========================================================================
  describe('5. Cross-Installation Identity & Isolation', () => {
    it('prevents cross-installation leakage and verifies installation identity', async () => {
      setInstallationIdForTesting('device_a');
      const runId = await createAgentRun('task_device_a', [], 'device_a');

      await recordAgentMessage({
        runId,
        taskId: 'task_device_a',
        fromAgent: 'SUSI',
        toAgent: 'ALL',
        type: 'status',
        content: 'Device A secret payload',
      });

      // Switch to Device B
      setInstallationIdForTesting('device_b');

      const run = await getAgentRun(runId);
      expect(run).toBeNull();

      const messages = await getAgentMessages(runId);
      expect(messages.length).toBe(0);

      const realInstallation = getVerifiedInstallationId();
      expect(realInstallation).toBe('device_b');
      expect(validateInstallationOwnership('device_b')).toBe(true);
      expect(validateInstallationOwnership('device_a')).toBe(false);
    });
  });
});
