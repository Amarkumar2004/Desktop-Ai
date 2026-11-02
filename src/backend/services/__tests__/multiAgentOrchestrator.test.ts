import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiAgentOrchestrator } from '../multiAgentOrchestrator';
import * as aiProviderService from '../aiProviderService';
import { researchRetrievalService } from '../researchRetrievalService';
import { workspaceFileWriter } from '../workspaceFileWriter';
import {
  getAgentRunsForTask,
  getAgentMessages,
  getAgentMemory,
} from '../agentRuntimeService';
import { createTask } from '../taskService';
import fs from 'fs';
import path from 'path';

describe('SUSI AI — Critical Runtime Audit & Production Hardening Regression Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. SPY RESEARCH TESTS
  // ---------------------------------------------------------------------------
  describe('1. SPY Research — Genuine Retrieval & Citation Integrity', () => {
    it('integrates genuine technical retrieval, stores authentic URLs, and does not fabricate fake sources', async () => {
      // Mock genuine retrieval service returning verified sources
      vi.spyOn(researchRetrievalService, 'retrieveEvidence').mockResolvedValue({
        toolStatus: 'retrieved',
        query: 'Next.js 16 App Router',
        sources: [
          {
            title: 'Next.js 16 Documentation',
            url: 'https://en.wikipedia.org/wiki/Next.js',
            snippet: 'Next.js is an open-source React front-end development web framework.',
            sourceType: 'web',
          },
        ],
        retrievedAt: new Date().toISOString(),
      });

      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('Research Directive for SPY')) {
          return { text: 'Directives issued', provider: 'openai', model: 'gpt-4o' };
        }
        if (req.prompt.includes('SPY, the Specialized Research')) {
          return {
            text: 'SPY Findings: Verified Next.js framework standards. Citations: https://en.wikipedia.org/wiki/Next.js',
            provider: 'groq',
            model: 'llama-3.3-70b',
          };
        }
        if (req.prompt.includes('EURO, the Senior Research Analysis')) {
          return { text: 'Blueprint ready', provider: 'gemini', model: 'gemini-2.0' };
        }
        if (req.prompt.includes('LEX, the Lead Implementation')) {
          return { text: '```typescript\n// File: src/components/TestCard.tsx\nexport const x = 1;\n```', provider: 'gemini', model: 'gemini-2.0' };
        }
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          return {
            text: '```json\n{"verdict": "VERIFIED_PASS", "acceptanceCriteriaMet": true, "evidenceCredible": true, "fileOperationsVerified": true, "auditNotes": "Verified"}\n```',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'fallback', provider: 'gemini', model: 'gemini-2.0' };
      });

      const task = await createTask({
        title: 'Research Next.js 16 Architecture',
        assignedAgent: 'SUSI',
        priority: 'High',
        category: 'Research',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Analyze Next.js App Router',
      });

      expect(result.success).toBe(true);
      expect(result.spyResearch?.retrievalStatus).toBe('retrieved');
      expect(result.spyResearch?.sources).toEqual(['https://en.wikipedia.org/wiki/Next.js']);

      // Check agent memory stores the authentic URLs
      const spyMemory = await getAgentMemory('SPY');
      const taskMem = spyMemory.find((m) => m.memory_key.includes(task.id));
      expect(taskMem).toBeDefined();
      expect(JSON.stringify(taskMem?.content)).toContain('https://en.wikipedia.org/wiki/Next.js');
    });

    it('reports honestly when external research retrieval tools are unavailable (never fabricates fake citations)', async () => {
      vi.spyOn(researchRetrievalService, 'retrieveEvidence').mockResolvedValue({
        toolStatus: 'unavailable',
        query: 'Quantum Computing Specs',
        sources: [],
        retrievedAt: new Date().toISOString(),
        diagnosticNotes: 'Upstream retrieval API HTTP 503: Service Unavailable',
      });

      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('SPY, the Specialized Research')) {
          return {
            text: 'Live web retrieval unavailable; findings reflect offline architectural baseline.',
            provider: 'groq',
            model: 'llama-3.3-70b',
          };
        }
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          return {
            text: '```json\n{"verdict": "VERIFIED_PASS", "acceptanceCriteriaMet": true, "evidenceCredible": true, "fileOperationsVerified": true, "auditNotes": "Offline baseline verified"}\n```',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'ok', provider: 'gemini', model: 'gemini-2.0' };
      });

      const task = await createTask({
        title: 'Offline Research Task',
        assignedAgent: 'SUSI',
        priority: 'Medium',
        category: 'Research',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Quantum Computing',
      });

      expect(result.spyResearch?.retrievalStatus).toBe('unavailable');
      expect(result.spyResearch?.sources).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LEX EXECUTION & WORKSPACE FILE WRITER TESTS
  // ---------------------------------------------------------------------------
  describe('2. LEX Execution — Restricted Workspace File Writer & Read-Back Verification', () => {
    it('strictly enforces workspace boundary and prevents path traversal escapes', () => {
      expect(() => {
        workspaceFileWriter.resolveAndValidatePath('../../secret_outside.env');
      }).toThrow(/traverse outside authorized workspace/i);

      expect(() => {
        workspaceFileWriter.resolveAndValidatePath('/etc/passwd');
      }).toThrow(/traverse outside authorized workspace|Access to sensitive file/i);

      expect(() => {
        workspaceFileWriter.resolveAndValidatePath('src/components/../../../Windows/System32/cmd.exe');
      }).toThrow(/traverse outside authorized workspace/i);
    });

    it('prohibits writes to sensitive configuration files (.env, .git, etc.)', () => {
      expect(() => {
        workspaceFileWriter.resolveAndValidatePath('.env.local');
      }).toThrow(/Access to sensitive file or directory/i);

      expect(() => {
        workspaceFileWriter.resolveAndValidatePath('src/.git/config');
      }).toThrow(/Access to sensitive file or directory/i);
    });

    it('requires explicit approval before overwriting existing files', async () => {
      const testRelPath = 'scratch/test_overwrite_target.txt';
      const absPath = path.resolve(process.cwd(), testRelPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, 'Existing content', 'utf8');

      // Attempt write without trustedApproval
      const res = await workspaceFileWriter.writeFile(testRelPath, 'New content', {});

      expect(res.success).toBe(false);
      expect(res.operation).toBe('rejected');
      expect(res.error).toContain('Explicit trusted user approval is required');

      // Clean up test file
      try {
        fs.unlinkSync(absPath);
      } catch {}
    });

    it('writes safe file and performs immediate read-back verification', async () => {
      const testRelPath = 'scratch/test_readback_verified.txt';
      const content = 'SUSI_VERIFIED_CONTENT_TOKEN_999';

      const res = await workspaceFileWriter.writeFile(testRelPath, content);

      expect(res.success).toBe(true);
      expect(res.verified).toBe(true);
      expect(res.bytesWritten).toBe(Buffer.byteLength(content, 'utf8'));

      // Verify file genuinely exists on disk
      const diskContent = fs.readFileSync(res.path, 'utf8');
      expect(diskContent).toBe(content);

      // Clean up test file
      try {
        fs.unlinkSync(res.path);
      } catch {}
    });

    it('distinguishes in-memory code generation from disk file execution', async () => {
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('LEX, the Lead Implementation')) {
          return {
            text: 'Deliverable:\n```typescript\n// File: src/components/GeneratedOnly.tsx\nexport const gen = true;\n```',
            provider: 'gemini',
            model: 'gemini-2.0',
          };
        }
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          return {
            text: '```json\n{"verdict": "VERIFIED_PASS", "acceptanceCriteriaMet": true, "evidenceCredible": true, "fileOperationsVerified": true, "auditNotes": "Artifacts generated in memory"}\n```',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'ok', provider: 'openai', model: 'gpt-4o' };
      });

      const task = await createTask({
        title: 'Generate Component In-Memory',
        assignedAgent: 'SUSI',
        priority: 'Medium',
        category: 'Frontend',
      });

      // Default execution: applyChanges is false
      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Generate component without writing to disk',
        context: { applyChanges: false },
      });

      expect(result.lexExecution?.executionMode).toBe('artifacts_generated');
      expect(result.lexExecution?.fileOperations).toBeUndefined();
      expect(result.lexExecution?.artifacts.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SUSI VERIFICATION TESTS
  // ---------------------------------------------------------------------------
  describe('3. SUSI Verification — Strict Structured Evaluation & Rejection of Ambiguity', () => {
    it('fails verification if verdict is missing, unparseable, or ambiguous', async () => {
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          // Ambiguous output without structured JSON verdict
          return {
            text: 'The code seems pretty good and probably works well without major issues.',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'ok', provider: 'gemini', model: 'gemini-2.0' };
      });

      const task = await createTask({
        title: 'Task with Ambiguous Verification',
        assignedAgent: 'SUSI',
        priority: 'High',
        category: 'Operations',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Ambiguous test',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.susiVerification?.verified).toBe(false);
      expect(result.susiVerification?.verificationVerdict).toBe('VERIFIED_FAIL');
    });

    it('fails verification if acceptanceCriteriaMet is false', async () => {
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          return {
            text: '```json\n{"verdict": "VERIFIED_PASS", "acceptanceCriteriaMet": false, "evidenceCredible": true, "fileOperationsVerified": true, "auditNotes": "User objective criteria was not met"}\n```',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'ok', provider: 'gemini', model: 'gemini-2.0' };
      });

      const task = await createTask({
        title: 'Task Missing Criteria',
        assignedAgent: 'SUSI',
        priority: 'Medium',
        category: 'Operations',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Missing criteria test',
      });

      expect(result.success).toBe(false);
      expect(result.susiVerification?.verified).toBe(false);
    });

    it('fails verification if file writes were requested but rejected or unverified', async () => {
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('LEX, the Lead Implementation')) {
          return {
            text: 'Deliverable:\n```typescript\n// File: .env.local\nSECRET=123\n```',
            provider: 'gemini',
            model: 'gemini-2.0',
          };
        }
        if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
          return {
            text: '```json\n{"verdict": "VERIFIED_PASS", "acceptanceCriteriaMet": true, "evidenceCredible": true, "fileOperationsVerified": false, "auditNotes": "File operation rejected"}\n```',
            provider: 'openai',
            model: 'gpt-4o',
          };
        }
        return { text: 'ok', provider: 'gemini', model: 'gemini-2.0' };
      });

      const task = await createTask({
        title: 'Forbidden File Write Attempt',
        assignedAgent: 'SUSI',
        priority: 'Critical',
        category: 'Security',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Write forbidden file',
        context: { applyChanges: true },
      });

      expect(result.success).toBe(false);
      expect(result.susiVerification?.verified).toBe(false);
      expect(result.lexExecution?.fileOperations?.[0].operation).toBe('rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CANCELLATION TESTS ACROSS EVERY STAGE
  // ---------------------------------------------------------------------------
  describe('4. Cancellation — Request Abort Propagation across All Stages', () => {
    it('cancels cleanly during Stage 1 (Planning)', async () => {
      const controller = new AbortController();
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('Research Directive for SPY')) {
          controller.abort(new Error('User cancelled during planning'));
          throw new Error('Pipeline cancelled by client.');
        }
        return { text: 'ok', provider: 'openai', model: 'gpt-4o' };
      });

      const task = await createTask({ title: 'Cancel at Stage 1', assignedAgent: 'SUSI', priority: 'Low', category: 'Ops' });
      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Cancel test',
        signal: controller.signal,
      });

      expect(result.status).toBe('cancelled');
      const dbRuns = await getAgentRunsForTask(task.id);
      expect(dbRuns[0].status).toBe('cancelled');
    });

    it('cancels cleanly during Stage 2 (Research)', async () => {
      const controller = new AbortController();
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('SPY, the Specialized Research')) {
          controller.abort(new Error('User cancelled during research'));
          throw new Error('Pipeline cancelled by client.');
        }
        return { text: 'ok', provider: 'openai', model: 'gpt-4o' };
      });

      const task = await createTask({ title: 'Cancel at Stage 2', assignedAgent: 'SUSI', priority: 'Low', category: 'Ops' });
      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Cancel test',
        signal: controller.signal,
      });

      expect(result.status).toBe('cancelled');
    });

    it('cancels cleanly during Stage 3 (Analysis)', async () => {
      const controller = new AbortController();
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('EURO, the Senior Research Analysis')) {
          controller.abort(new Error('User cancelled during analysis'));
          throw new Error('Pipeline cancelled by client.');
        }
        return { text: 'ok', provider: 'openai', model: 'gpt-4o' };
      });

      const task = await createTask({ title: 'Cancel at Stage 3', assignedAgent: 'SUSI', priority: 'Low', category: 'Ops' });
      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Cancel test',
        signal: controller.signal,
      });

      expect(result.status).toBe('cancelled');
    });

    it('cancels cleanly during Stage 4 (Execution)', async () => {
      const controller = new AbortController();
      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
        if (req.prompt.includes('LEX, the Lead Implementation')) {
          controller.abort(new Error('User cancelled during execution'));
          throw new Error('Pipeline cancelled by client.');
        }
        return { text: 'ok', provider: 'openai', model: 'gpt-4o' };
      });

      const task = await createTask({ title: 'Cancel at Stage 4', assignedAgent: 'SUSI', priority: 'Low', category: 'Ops' });
      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Cancel test',
        signal: controller.signal,
      });

      expect(result.status).toBe('cancelled');
    });

    it('cancels cleanly via cancelPipeline API method', async () => {
      const task = await createTask({ title: 'Cancel via API', assignedAgent: 'SUSI', priority: 'Low', category: 'Ops' });

      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async () => {
        // Trigger cancellation midway
        multiAgentOrchestrator.cancelPipeline(task.id, 'Client invoked cancellation');
        await new Promise((r) => setTimeout(r, 20));
        throw new Error('Pipeline cancelled by client.');
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Cancel test',
      });

      expect(result.status).toBe('cancelled');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. PERSISTENCE & SECURITY
  // ---------------------------------------------------------------------------
  describe('5. Persistence & Security — Credential Scrubbing & RLS Isolation', () => {
    it('scrubs API keys, private tokens, and passwords from messages and memory', async () => {
      const rawSecret = 'sk-proj-test1234567890abcdefghijklmnop';

      vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async () => {
        return {
          text: `Leaked secret output: ${rawSecret}`,
          provider: 'openai',
          model: 'gpt-4o',
        };
      });

      const task = await createTask({
        title: 'Secret Leak Test',
        assignedAgent: 'SUSI',
        priority: 'High',
        category: 'Security',
      });

      const result = await multiAgentOrchestrator.executePipeline({
        taskId: task.id,
        title: task.title,
        objective: 'Check scrubbing',
        context: { apiKey: rawSecret },
      });

      const messages = await getAgentMessages(result.runId);
      const dumped = JSON.stringify(messages);

      expect(dumped).not.toContain(rawSecret);
      expect(dumped).toMatch(/\[REDACTED_API_KEY\]|\[REDACTED_OPENAI_KEY\]/);
    });
  });
});
