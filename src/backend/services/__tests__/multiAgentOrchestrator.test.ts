import { describe, it, expect, vi, beforeEach } from 'vitest';
import { multiAgentOrchestrator } from '../multiAgentOrchestrator';
import * as aiProviderService from '../aiProviderService';
import {
  getAgentRunsForTask,
  getAgentMessages,
  getAgentMemory,
} from '../agentRuntimeService';
import { createTask, getTaskSteps } from '../taskService';

describe('MultiAgentOrchestrator — SUSI Swarm Runtime Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Executes complete 5-stage pipeline: SUSI -> SPY -> EURO -> LEX -> SUSI Verification', async () => {
    // Mock AI inferences for each stage
    const aiSpy = vi.spyOn(aiProviderService, 'executeAiInference');

    aiSpy.mockImplementation(async (req) => {
      if (req.prompt.includes('Research Directive for SPY')) {
        return {
          text: 'SUSI PLAN: 1. SPY: Verify Next.js 16 conventions. 2. EURO: Analyze performance. 3. LEX: Build component.',
          provider: 'openai',
          model: 'gpt-4o',
        };
      }
      if (req.prompt.includes('SPY, the Specialized Research')) {
        return {
          text: 'SPY FINDINGS: Verified Next.js 16 App Router requires async params and React 19 server components.',
          provider: 'groq',
          model: 'llama-3.3-70b-versatile',
        };
      }
      if (req.prompt.includes('EURO, the Senior Research Analysis')) {
        return {
          text: 'EURO BLUEPRINT: Architecture is verified. Risks: hydration mismatch if async params not awaited. Mitigation: strictly await props.params.',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
        };
      }
      if (req.prompt.includes('LEX, the Lead Implementation')) {
        return {
          text: 'LEX IMPLEMENTATION:\n```typescript\n// File: src/components/DashboardMetrics.tsx\nexport default function DashboardMetrics() { return <div>Metrics OK</div>; }\n```\nDeliverables ready.',
          provider: 'gemini',
          model: 'gemini-2.0-flash',
        };
      }
      if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
        return {
          text: '[VERIFIED: YES]\nAll deliverables meet Next.js 16 standards and zero security issues detected.\nExecutive Summary: Dashboard component built and verified.',
          provider: 'openai',
          model: 'gpt-4o',
        };
      }
      return { text: 'Generic output', provider: 'local-smart-engine', model: 'mock-model' };
    });

    const task = await createTask({
      title: 'Build Verified Dashboard Metrics Component',
      assignedAgent: 'SUSI',
      priority: 'High',
      category: 'Frontend',
      description: 'Implement Next.js 16 compliant metrics card',
    });

    const result = await multiAgentOrchestrator.executePipeline({
      taskId: task.id,
      title: task.title,
      objective: 'Implement Next.js 16 compliant metrics card',
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.status === 'completed')).toBe(true);

    // Verify artifacts extracted
    expect(result.lexExecution?.artifacts).toBeDefined();
    expect(result.lexExecution?.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(result.lexExecution?.artifacts[0].filename).toBe('src/components/DashboardMetrics.tsx');

    // Verify verification passed
    expect(result.susiVerification?.verified).toBe(true);
    expect(result.susiVerification?.executiveSummary).toContain('[VERIFIED: YES]');

    // Verify database persistence of steps, messages, and runs
    const dbSteps = await getTaskSteps(task.id);
    expect(dbSteps.length).toBe(5);
    expect(dbSteps.every((s) => s.status === 'completed')).toBe(true);

    const dbRuns = await getAgentRunsForTask(task.id);
    expect(dbRuns.length).toBeGreaterThanOrEqual(1);
    expect(dbRuns[0].status).toBe('completed');

    const dbMessages = await getAgentMessages(result.runId);
    expect(dbMessages.length).toBeGreaterThanOrEqual(5);

    // Verify agents communicated
    const agentsInStream = new Set(dbMessages.map((m) => m.from_agent));
    expect(agentsInStream.has('SUSI')).toBe(true);
    expect(agentsInStream.has('SPY')).toBe(true);
    expect(agentsInStream.has('EURO')).toBe(true);
    expect(agentsInStream.has('LEX')).toBe(true);

    // Verify agent memory was stored for SPY and EURO
    const spyMemory = await getAgentMemory('SPY');
    expect(spyMemory.some((m) => m.memory_key?.includes(task.id))).toBe(true);

    const euroMemory = await getAgentMemory('EURO');
    expect(euroMemory.some((m) => m.memory_key?.includes(task.id))).toBe(true);
  });

  it('2. Fails closed when AI providers are unavailable (never fabricates fake success)', async () => {
    vi.spyOn(aiProviderService, 'executeAiInference').mockRejectedValue(
      new Error('No AI providers are configured or responsive. Configured providers: none.')
    );

    const task = await createTask({
      title: 'Audit Mission Critical Gateway',
      assignedAgent: 'SUSI',
      priority: 'Critical',
      category: 'Security',
    });

    const result = await multiAgentOrchestrator.executePipeline({
      taskId: task.id,
      title: task.title,
      objective: 'Verify gateway TLS endpoints',
    });

    // Must fail closed with error — never fabricate mock success!
    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('No AI providers are configured');

    const dbRuns = await getAgentRunsForTask(task.id);
    expect(dbRuns[0].status).toBe('failed');

    const dbSteps = await getTaskSteps(task.id);
    expect(dbSteps.some((s) => s.status === 'failed')).toBe(true);
  });

  it('3. Supports explicit cancellation midway through pipeline', async () => {
    const controller = new AbortController();

    // Abort after stage 1 planning
    vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
      if (req.prompt.includes('Research Directive for SPY')) {
        controller.abort();
        return { text: 'SUSI plan produced.', provider: 'openai', model: 'mock-model' };
      }
      throw new Error('Pipeline cancelled by client.');
    });

    const task = await createTask({
      title: 'Long Running Large Architecture Task',
      assignedAgent: 'SUSI',
      priority: 'Low',
      category: 'Architecture',
    });

    const result = await multiAgentOrchestrator.executePipeline({
      taskId: task.id,
      title: task.title,
      objective: 'Long running task that will be cancelled',
      signal: controller.signal,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('cancelled');

    const dbRuns = await getAgentRunsForTask(task.id);
    expect(dbRuns[0].status).toBe('cancelled');
  });

  it('4. Rejects verification and marks task failed when deliverables do not meet criteria', async () => {
    vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
      if (req.prompt.includes('Research Directive for SPY')) {
        return { text: 'Plan ok', provider: 'openai', model: 'gpt-4o' };
      }
      if (req.prompt.includes('SPY, the Specialized Research')) {
        return { text: 'Research ok', provider: 'groq', model: 'llama-3.3' };
      }
      if (req.prompt.includes('EURO, the Senior Research Analysis')) {
        return { text: 'Blueprint ok', provider: 'gemini', model: 'gemini-2.0' };
      }
      if (req.prompt.includes('LEX, the Lead Implementation')) {
        return { text: 'Incomplete stub code', provider: 'gemini', model: 'gemini-2.0' };
      }
      if (req.prompt.includes('SUSI, the Master Orchestration & Verification')) {
        return {
          text: '[VERIFIED: NO]\nImplementation deliverables are incomplete and lacked error handling.\nExecutive Summary: Rejected.',
          provider: 'openai',
          model: 'gpt-4o',
        };
      }
      return { text: 'fallback', provider: 'gemini', model: 'gemini-2.0' };
    });

    const task = await createTask({
      title: 'Incomplete Feature Implementation',
      assignedAgent: 'SUSI',
      priority: 'Medium',
      category: 'Operations',
    });

    const result = await multiAgentOrchestrator.executePipeline({
      taskId: task.id,
      title: task.title,
      objective: 'Implement feature that fails verification',
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.susiVerification?.verified).toBe(false);
  });

  it('5. Ensures data isolation and never leaks raw API credentials into messages or memory', async () => {
    const rawKey = 'sk-proj-super-secret-production-token-12345';

    vi.spyOn(aiProviderService, 'executeAiInference').mockImplementation(async (req) => {
      return {
        text: `Output mentioning system status. Prompt had: ${req.prompt.slice(0, 50)}`,
        provider: 'openai',
        model: 'gpt-4o',
      };
    });

    const task = await createTask({
      title: 'Security Verification Task',
      assignedAgent: 'SUSI',
      priority: 'High',
      category: 'Security',
    });

    const result = await multiAgentOrchestrator.executePipeline({
      taskId: task.id,
      title: task.title,
      objective: 'Secure processing',
      context: { apiKey: rawKey }, // context may contain a secret that must not be emitted
    });

    const dbMessages = await getAgentMessages(result.runId);
    const dbMemory = await getAgentMemory('SPY');

    // Messages and memory must never expose secrets
    const messageDump = JSON.stringify(dbMessages);
    const memoryDump = JSON.stringify(dbMemory);

    expect(messageDump.includes(rawKey)).toBe(false);
    expect(memoryDump.includes(rawKey)).toBe(false);
  });
});
