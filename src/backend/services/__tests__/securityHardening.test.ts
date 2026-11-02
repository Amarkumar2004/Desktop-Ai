import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WorkspaceFileWriter } from '../workspaceFileWriter';
import {
  createAgentRun,
  updateAgentRun,
  recordAgentMessage,
  saveAgentMemory,
  getAgentRun,
  getAgentRunsForTask,
  getAgentMessages,
  getAgentMemory,
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
  // 1. ANONYMOUS SUPABASE & CROSS-INSTALLATION ISOLATION
  // ===========================================================================
  describe('1. Anonymous Supabase & Cross-Installation Isolation', () => {
    it('prevents different desktop installations from reading each other’s agent runs, messages, and memories', async () => {
      // Installation A runs
      setInstallationIdForTesting('installation_device_alpha');
      const taskId = 'task_isolated_alpha';
      const runIdAlpha = await createAgentRun(taskId, [{ step: 'Alpha plan' }]);

      await recordAgentMessage({
        runId: runIdAlpha,
        taskId,
        fromAgent: 'SUSI',
        toAgent: 'SPY',
        type: 'assignment',
        content: 'Confidential directive for Installation Alpha',
      });

      await saveAgentMemory('SPY', 'alpha_key', { secretIntel: 'alpha_value' });

      // Verify Installation A can read its own data
      const runsAlpha = await getAgentRunsForTask(taskId);
      expect(runsAlpha.length).toBe(1);
      expect(runsAlpha[0].id).toBe(runIdAlpha);

      const msgsAlpha = await getAgentMessages(runIdAlpha);
      expect(msgsAlpha.length).toBe(1);
      expect(msgsAlpha[0].content).toContain('Confidential directive for Installation Alpha');

      const memAlpha = await getAgentMemory('SPY', 'alpha_key');
      expect(memAlpha.length).toBe(1);

      // Now switch context to Installation B (different desktop machine)
      setInstallationIdForTesting('installation_device_beta');

      // Installation B attempts to read Installation A's run
      const runFromBeta = await getAgentRun(runIdAlpha);
      expect(runFromBeta).toBeNull(); // Strictly isolated: cannot read run

      const runsFromBeta = await getAgentRunsForTask(taskId);
      expect(runsFromBeta.length).toBe(0); // Strictly isolated: empty list

      const msgsFromBeta = await getAgentMessages(runIdAlpha);
      expect(msgsFromBeta.length).toBe(0); // Strictly isolated: cannot read messages

      const memFromBeta = await getAgentMemory('SPY', 'alpha_key');
      expect(memFromBeta.length).toBe(0); // Strictly isolated: cannot read memory

      // Installation B attempts to mutate Installation A's run -> must be rejected
      await expect(
        updateAgentRun(runIdAlpha, { status: 'failed' })
      ).rejects.toThrow(/Access denied: Cannot modify agent run belonging to another installation/i);
    });

    it('rejects untrusted, client-spoofed installation IDs', () => {
      const realId = getVerifiedInstallationId();
      expect(validateInstallationOwnership(realId)).toBe(true);
      expect(validateInstallationOwnership('forged_client_installation_id')).toBe(false);
      expect(validateInstallationOwnership('')).toBe(false);
    });
  });

  // ===========================================================================
  // 2. WORKSPACE SYMLINK PROTECTION & TRAVERSAL ESCAPES
  // ===========================================================================
  describe('2. Workspace Symlink Protection & Traversal Escapes', () => {
    const fileWriter = new WorkspaceFileWriter(tempWorkspace);

    it('rejects symlinks that point outside the authorized workspace', async () => {
      const targetOutsideFile = path.join(outsideWorkspace, 'escaped_secret.txt');
      fs.writeFileSync(targetOutsideFile, 'OUTSIDE_DATA', 'utf8');

      // Create a symlink inside the workspace pointing outside
      const symlinkInside = path.join(tempWorkspace, 'symlink_escape');
      try {
        fs.symlinkSync(outsideWorkspace, symlinkInside, 'junction');
      } catch {
        try {
          fs.symlinkSync(outsideWorkspace, symlinkInside, 'dir');
        } catch {
          // Skip on environments where symlink creation requires elevated Windows privileges
          return;
        }
      }

      // Attempting to resolve or write through the symlink to an outside file must throw
      expect(() => {
        fileWriter.resolveAndValidatePath('symlink_escape/escaped_secret.txt', tempWorkspace);
      }).toThrow(/Security violation.*outside authorized workspace/i);

      const writeRes = await fileWriter.writeFile(
        'symlink_escape/escaped_secret.txt',
        'MALICIOUS_OVERWRITE',
        { workspaceRoot: tempWorkspace }
      );
      expect(writeRes.success).toBe(false);
      expect(writeRes.operation).toBe('rejected');
      expect(writeRes.error).toMatch(/Security violation.*outside authorized workspace/i);

      // Verify the outside file was NOT modified
      expect(fs.readFileSync(targetOutsideFile, 'utf8')).toBe('OUTSIDE_DATA');
    });

    it('rejects nested symlink chains and relative traversal escapes', () => {
      expect(() => {
        fileWriter.resolveAndValidatePath('../../../etc/passwd', tempWorkspace);
      }).toThrow(/Security violation.*attempts to traverse outside authorized workspace/i);

      expect(() => {
        fileWriter.resolveAndValidatePath('subfolder/../../../../Windows/cmd.exe', tempWorkspace);
      }).toThrow(/Security violation.*attempts to traverse outside authorized workspace/i);
    });
  });

  // ===========================================================================
  // 3. TRUSTED OVERWRITE APPROVAL ENGINE
  // ===========================================================================
  describe('3. Trusted Overwrite Approval Engine', () => {
    const fileWriter = new WorkspaceFileWriter(tempWorkspace);

    it('never accepts arbitrary boolean flags in task context as sufficient authorization', async () => {
      const existingFile = path.join(tempWorkspace, 'protected_doc.txt');
      fs.writeFileSync(existingFile, 'ORIGINAL_PROTECTED_DATA', 'utf8');

      // Attempt write with arbitrary context flags (should be completely ignored)
      const res = await fileWriter.writeFile('protected_doc.txt', 'NEW_OVERWRITE_ATTEMPT', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_xyz',
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Explicit trusted user approval is required');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('ORIGINAL_PROTECTED_DATA');
    });

    it('successfully overwrites when valid, fresh trusted approval is supplied', async () => {
      const existingFile = path.join(tempWorkspace, 'approved_overwrite.txt');
      fs.writeFileSync(existingFile, 'INITIAL_STATE', 'utf8');

      const approval = fileWriter.issueOverwriteApproval({
        taskId: 'task_100',
        filePath: 'approved_overwrite.txt',
        userId: 'user_alice',
        ttlMs: 60000,
      });

      const res = await fileWriter.writeFile('approved_overwrite.txt', 'APPROVED_UPDATE_SUCCESS', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_100',
        userId: 'user_alice',
        trustedApproval: approval,
      });

      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.operation).toBe('modified');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('APPROVED_UPDATE_SUCCESS');
    });

    it('rejects reused approvals (enforces single-use nonce consumption)', async () => {
      const existingFile = path.join(tempWorkspace, 'replay_test.txt');
      fs.writeFileSync(existingFile, 'VERSION_1', 'utf8');

      const approval = fileWriter.issueOverwriteApproval({
        taskId: 'task_replay',
        filePath: 'replay_test.txt',
      });

      // First write: succeeds and consumes the approval
      const res1 = await fileWriter.writeFile('replay_test.txt', 'VERSION_2', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_replay',
        trustedApproval: approval,
      });
      expect(res1.success).toBe(true);

      // Replay attempt with same approval token: must fail immediately!
      const res2 = await fileWriter.writeFile('replay_test.txt', 'VERSION_3_ATTACK', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_replay',
        trustedApproval: approval,
      });
      expect(res2.success).toBe(false);
      expect(res2.operation).toBe('rejected');
      expect(res2.error).toContain('Approval token is invalid, unrecognized, or has already been consumed');
      expect(fs.readFileSync(existingFile, 'utf8')).toBe('VERSION_2');
    });

    it('rejects expired approvals', async () => {
      const existingFile = path.join(tempWorkspace, 'expired_test.txt');
      fs.writeFileSync(existingFile, 'INITIAL', 'utf8');

      // Issue approval with negative TTL (already expired)
      const approval = fileWriter.issueOverwriteApproval({
        taskId: 'task_expired',
        filePath: 'expired_test.txt',
        ttlMs: -1000,
      });

      const res = await fileWriter.writeFile('expired_test.txt', 'SHOULD_FAIL', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_expired',
        trustedApproval: approval,
      });

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Approval token has expired');
    });

    it('rejects mismatched approvals (wrong task, wrong file, or wrong user)', async () => {
      const existingFile = path.join(tempWorkspace, 'file_a.txt');
      fs.writeFileSync(existingFile, 'CONTENT_A', 'utf8');

      const approval = fileWriter.issueOverwriteApproval({
        taskId: 'task_a',
        filePath: 'file_a.txt',
        userId: 'user_a',
      });

      // Mismatched task ID
      const resTaskMismatch = await fileWriter.writeFile('file_a.txt', 'NEW_A', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_DIFFERENT',
        userId: 'user_a',
        trustedApproval: approval,
      });
      expect(resTaskMismatch.success).toBe(false);
      expect(resTaskMismatch.error).toContain('Approval token task mismatch');

      // Re-issue approval for file mismatch test
      const approval2 = fileWriter.issueOverwriteApproval({
        taskId: 'task_a',
        filePath: 'file_a.txt',
      });

      // Ensure file_b.txt also exists so it requires overwrite approval
      const existingFileB = path.join(tempWorkspace, 'file_b.txt');
      fs.writeFileSync(existingFileB, 'CONTENT_B', 'utf8');

      const resFileMismatch = await fileWriter.writeFile('file_b.txt', 'NEW_B', {
        workspaceRoot: tempWorkspace,
        taskId: 'task_a',
        trustedApproval: approval2,
      });
      expect(resFileMismatch.success).toBe(false);
      expect(resFileMismatch.error).toContain('Approval token path mismatch');
    });
  });

  // ===========================================================================
  // 4. API ROUTE AUTHORIZATION & TASK OWNERSHIP
  // ===========================================================================
  describe('4. API Route Authorization & Task Ownership', () => {
    const bootstrapSecret = getBootstrapToken();
    const sessionRes = createDesktopSession(bootstrapSecret);
    const validToken = sessionRes.session!.token;

    it('rejects unauthenticated requests without valid desktop session or credentials', async () => {
      const unauthReq = new NextRequest('http://localhost:3000/api/agents/orchestrate', {
        method: 'POST',
        headers: {
          host: 'external-malicious-site.com',
          origin: 'http://evil-origin.com',
        },
        body: JSON.stringify({ title: 'Hacked run' }),
      });

      const res = await POST(unauthReq);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Unauthorized');
    });

    it('prevents users from inspecting or modifying another user’s tasks by guessing taskId', async () => {
      // Mock taskService to return a task belonging to 'user_victim'
      vi.spyOn(taskService, 'getTasks').mockResolvedValue([
        {
          id: 'task_victim_private_999',
          title: 'Victim Private Task',
          assignedAgent: 'SUSI',
          priority: 'High',
          category: 'Finance',
          progress: 50,
          completed: false,
        },
      ]);

      // Attacker queries with desktop session for victim's task
      const attackerReq = new NextRequest('http://localhost:3000/api/agents/orchestrate?taskId=task_victim_private_999', {
        method: 'GET',
        headers: {
          [DESKTOP_AUTH_HEADER]: validToken,
        },
      });

      const res = await GET(attackerReq);
      const data = await res.json();
      // Since attacker does not own victim's runs, no victim runs are returned
      expect(data.runs).toEqual([]);
    });

    it('prevents cancelling another user’s task via DELETE or POST cancel', async () => {
      const cancelReq = new NextRequest('http://localhost:3000/api/agents/orchestrate?taskId=task_victim_private_999', {
        method: 'DELETE',
        headers: {
          [DESKTOP_AUTH_HEADER]: validToken,
        },
      });

      const res = await DELETE(cancelReq);
      const data = await res.json();
      expect(data.cancelled).toBe(false);
      expect(data.message).toContain('No active pipeline was found');
    });
  });
});
