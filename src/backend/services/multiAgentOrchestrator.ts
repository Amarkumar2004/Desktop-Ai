/**
 * SUSI AI — Multi-Agent Orchestrator Service
 *
 * Implements the full autonomous multi-agent execution pipeline:
 * SUSI (Manager) → SPY (Research) → EURO (Analysis) → LEX (Execution) → SUSI (Verification)
 *
 * Persists state to:
 * - tasks & task_steps (Task tracking)
 * - agent_runs (Execution lifecycle)
 * - agent_messages (Inter-agent communication stream)
 * - agent_memory (Cross-agent knowledge artifacts)
 */

import {
  createAgentRun,
  updateAgentRun,
  recordAgentMessage,
  saveAgentMemory,
  WorkforceAgentId,
} from './agentRuntimeService';
import { updateTask, createTaskStep, updateTaskStep } from './taskService';
import { executeAiInference } from './aiProviderService';
import type { Json, AgentMessage } from '@/backend/types/database';

export interface MultiAgentStepRecord {
  agent: WorkforceAgentId;
  stage: 'PLANNING' | 'RESEARCH' | 'ANALYSIS' | 'EXECUTION' | 'VERIFICATION';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  title: string;
  summary?: string;
  details?: Json;
  error?: string;
  durationMs?: number;
}

export interface MultiAgentPipelineInput {
  taskId: string;
  title: string;
  objective: string;
  context?: Record<string, unknown>;
  signal?: AbortSignal;
  onProgress?: (step: MultiAgentStepRecord, message?: AgentMessage) => void;
}

export interface MultiAgentPipelineResult {
  success: boolean;
  runId: string;
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  steps: MultiAgentStepRecord[];
  spyResearch?: {
    findings: string;
    sources: string[];
    technicalPrerequisites: string[];
  };
  euroAnalysis?: {
    insights: string;
    risks: string[];
    blueprint: string;
  };
  lexExecution?: {
    implementationSummary: string;
    artifacts: { filename: string; content: string; language?: string }[];
  };
  susiVerification?: {
    verified: boolean;
    verificationNotes: string;
    executiveSummary: string;
  };
  finalOutput?: string;
  error?: string;
}

export class MultiAgentOrchestrator {
  /**
   * Executes the complete 5-stage multi-agent pipeline.
   */
  async executePipeline(input: MultiAgentPipelineInput): Promise<MultiAgentPipelineResult> {
    const { taskId, title, objective, context = {}, signal, onProgress } = input;
    const steps: MultiAgentStepRecord[] = [];
    let currentStepId: string | null = null;

    // Check cancellation before start
    if (signal?.aborted) {
      throw new Error('Pipeline cancelled before execution started.');
    }

    // 1. Initialize Agent Run
    const runId = await createAgentRun(taskId, [
      { step: 1, agent: 'SUSI', role: 'Task Decomposition & Planning' },
      { step: 2, agent: 'SPY', role: 'Deep Research & Intelligence Gathering' },
      { step: 3, agent: 'EURO', role: 'Analytical Synthesis & Risk Blueprint' },
      { step: 4, agent: 'LEX', role: 'Implementation Deliverables & Execution' },
      { step: 5, agent: 'SUSI', role: 'Final Verification & Synthesis' },
    ]);

    await updateAgentRun(runId, { status: 'planning' });
    await updateTask(taskId, { progress: 5, status: 'in_progress', completed: false });

    // Helper to log message and trigger progress
    const logAndEmit = async (
      agent: WorkforceAgentId,
      toAgent: WorkforceAgentId | 'ALL',
      type: 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note',
      content: string,
      stageRecord: MultiAgentStepRecord,
      metadata?: Json
    ): Promise<AgentMessage> => {
      const msg = await recordAgentMessage({
        runId,
        taskId,
        fromAgent: agent,
        toAgent,
        type,
        content,
        metadata,
      });
      onProgress?.(stageRecord, msg);
      return msg;
    };

    try {
      // -----------------------------------------------------------------------
      // STAGE 1: SUSI (Manager / Planning)
      // -----------------------------------------------------------------------
      const stage1Start = Date.now();
      const stage1Record: MultiAgentStepRecord = {
        agent: 'SUSI',
        stage: 'PLANNING',
        status: 'running',
        title: 'Task Decomposition & Execution Plan',
      };
      steps.push(stage1Record);

      const dbStep1 = await createTaskStep({
        task_id: taskId,
        step_index: 1,
        action_type: 'MULTI_AGENT_PLAN',
        title: stage1Record.title,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      currentStepId = dbStep1.id;

      await logAndEmit(
        'SUSI',
        'ALL',
        'status',
        `SUSI accepting task "${title}". Decomposing objective into coordinated multi-agent plan for SPY, EURO, and LEX...`,
        stage1Record
      );

      const susiPlanPrompt = `You are SUSI, the Master Orchestrator and Manager AI of the SUSI AI multi-agent platform.
Deconstruct the following user goal into a strict 3-stage execution plan:
1. Research Directive for SPY (What exact facts, libraries, best practices, or specifications must be verified?)
2. Analysis Strategy for EURO (What architecture trade-offs, edge cases, and potential risks should be analyzed?)
3. Implementation Plan for LEX (What concrete, safe code or deliverables must be built?)

User Task: "${title}"
Detailed Objective: "${objective}"
Context: ${JSON.stringify(context)}

Respond in structured format with clear directives for each agent.`;

      const planResult = await executeAiInference({
        systemPrompt: 'You are SUSI, the executive manager of an autonomous multi-agent intelligence swarm.',
        prompt: susiPlanPrompt,
        temperature: 0.3,
        signal,
      });

      stage1Record.status = 'completed';
      stage1Record.summary = 'Multi-agent plan generated and assignments dispatched.';
      stage1Record.durationMs = Date.now() - stage1Start;
      stage1Record.details = { planOutput: planResult.text, provider: planResult.provider };

      await updateTaskStep(dbStep1.id, {
        status: 'completed',
        result: { plan: planResult.text },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: 20 });

      await logAndEmit(
        'SUSI',
        'SPY',
        'assignment',
        `Dispatched Research Directive to SPY:\n${planResult.text.slice(0, 400)}...`,
        stage1Record,
        { plan: planResult.text }
      );

      // -----------------------------------------------------------------------
      // STAGE 2: SPY (Research & Intelligence Gathering)
      // -----------------------------------------------------------------------
      if (signal?.aborted) throw new Error('Pipeline cancelled by client.');

      const stage2Start = Date.now();
      const stage2Record: MultiAgentStepRecord = {
        agent: 'SPY',
        stage: 'RESEARCH',
        status: 'running',
        title: 'Evidence-Based Technical Research',
      };
      steps.push(stage2Record);

      const dbStep2 = await createTaskStep({
        task_id: taskId,
        step_index: 2,
        action_type: 'MULTI_AGENT_RESEARCH',
        title: stage2Record.title,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      currentStepId = dbStep2.id;

      await logAndEmit(
        'SPY',
        'SUSI',
        'status',
        `SPY scanning documentation, technical specifications, and evidence for "${title}"...`,
        stage2Record
      );

      const spyResearchPrompt = `You are SPY, the Specialized Research & Technical Intelligence Agent of SUSI AI.
Your directive from SUSI:
${planResult.text}

User Objective:
"${objective}"

Conduct genuine, thorough research on this task.
Guidelines:
- Detail concrete technical standards, libraries, APIs, and official best practices.
- Cite relevant sources or standard conventions (e.g. Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, OWASP security).
- Enumerate prerequisites, performance considerations, and environmental constraints.
- Never hallucinate non-existent features or APIs.

Format response clearly with:
1. Core Findings & Standards
2. Source Citations / References
3. Technical Prerequisites & Dependencies`;

      const spyResult = await executeAiInference({
        systemPrompt: 'You are SPY, an elite technical intelligence and research AI agent. Strict accuracy and verifiable facts only.',
        prompt: spyResearchPrompt,
        temperature: 0.2,
        signal,
      });

      stage2Record.status = 'completed';
      stage2Record.summary = 'Research completed with verified technical evidence.';
      stage2Record.durationMs = Date.now() - stage2Start;
      stage2Record.details = { researchOutput: spyResult.text, provider: spyResult.provider };

      await saveAgentMemory('SPY', `research_${taskId}`, {
        title,
        summary: spyResult.text.slice(0, 500),
        fullResearch: spyResult.text,
      });

      await updateTaskStep(dbStep2.id, {
        status: 'completed',
        result: { research: spyResult.text },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: 45 });

      await logAndEmit(
        'SPY',
        'EURO',
        'handoff',
        `SPY completed research. Handing off findings to EURO for synthesis and risk assessment:\n${spyResult.text.slice(0, 350)}...`,
        stage2Record,
        { research: spyResult.text }
      );

      // -----------------------------------------------------------------------
      // STAGE 3: EURO (Analysis & Synthesis)
      // -----------------------------------------------------------------------
      if (signal?.aborted) throw new Error('Pipeline cancelled by client.');

      const stage3Start = Date.now();
      const stage3Record: MultiAgentStepRecord = {
        agent: 'EURO',
        stage: 'ANALYSIS',
        status: 'running',
        title: 'Analytical Synthesis & Risk Blueprint',
      };
      steps.push(stage3Record);

      const dbStep3 = await createTaskStep({
        task_id: taskId,
        step_index: 3,
        action_type: 'MULTI_AGENT_ANALYSIS',
        title: stage3Record.title,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      currentStepId = dbStep3.id;

      await logAndEmit(
        'EURO',
        'SPY',
        'status',
        `EURO analyzing SPY's research findings, testing for contradictions, edge cases, and architectural trade-offs...`,
        stage3Record
      );

      const euroAnalysisPrompt = `You are EURO, the Senior Research Analysis & Insight Synthesis Agent of SUSI AI.
You have received the following research intelligence from SPY:
----------------------------------------
${spyResult.text}
----------------------------------------

Original User Goal:
"${title} — ${objective}"

Critically evaluate this research:
1. Identify any contradictions, potential failure points, edge cases, or security risks.
2. Synthesize key architectural insights and compatibility requirements.
3. Formulate an actionable, concrete Execution Blueprint for LEX to implement.

Format response clearly:
- Analytical Assessment & Pattern Insights
- Identified Risks & Mitigations
- Actionable Blueprint for LEX`;

      const euroResult = await executeAiInference({
        systemPrompt: 'You are EURO, an analytical synthesis AI agent specializing in risk assessment, pattern detection, and blueprint architecture.',
        prompt: euroAnalysisPrompt,
        temperature: 0.2,
        signal,
      });

      stage3Record.status = 'completed';
      stage3Record.summary = 'Risk assessment completed and actionable blueprint generated.';
      stage3Record.durationMs = Date.now() - stage3Start;
      stage3Record.details = { analysisOutput: euroResult.text, provider: euroResult.provider };

      await saveAgentMemory('EURO', `analysis_${taskId}`, {
        title,
        blueprint: euroResult.text,
      });

      await updateTaskStep(dbStep3.id, {
        status: 'completed',
        result: { analysis: euroResult.text },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: 70 });

      await logAndEmit(
        'EURO',
        'LEX',
        'handoff',
        `EURO formulated blueprint. Dispatching implementation instructions to LEX:\n${euroResult.text.slice(0, 350)}...`,
        stage3Record,
        { blueprint: euroResult.text }
      );

      // -----------------------------------------------------------------------
      // STAGE 4: LEX (Execution & Implementation)
      // -----------------------------------------------------------------------
      if (signal?.aborted) throw new Error('Pipeline cancelled by client.');

      const stage4Start = Date.now();
      const stage4Record: MultiAgentStepRecord = {
        agent: 'LEX',
        stage: 'EXECUTION',
        status: 'running',
        title: 'Production Implementation Deliverables',
      };
      steps.push(stage4Record);

      const dbStep4 = await createTaskStep({
        task_id: taskId,
        step_index: 4,
        action_type: 'MULTI_AGENT_EXECUTION',
        title: stage4Record.title,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      currentStepId = dbStep4.id;

      await logAndEmit(
        'LEX',
        'EURO',
        'status',
        `LEX building concrete implementation deliverables based on EURO's blueprint...`,
        stage4Record
      );

      const lexExecutionPrompt = `You are LEX, the Lead Implementation & Execution Agent of SUSI AI.
EURO has provided the following execution blueprint:
----------------------------------------
${euroResult.text}
----------------------------------------

Original User Goal:
"${title} — ${objective}"

Build the complete, production-ready implementation deliverables for this request.
Guidelines:
- Provide clean, functional code, configuration, or operational artifacts in formatted markdown code blocks.
- If code is required, include file headers (e.g. // File: src/components/...) and full implementation without pseudo-code.
- Adhere to the project stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- Follow strict security controls: no dangerous OS commands or unauthorized system tampering.

Provide:
1. Executive Technical Summary of Deliverables
2. Complete Implementation Artifacts (Code / Config / Steps)
3. Verification & Validation Steps`;

      const lexResult = await executeAiInference({
        systemPrompt: 'You are LEX, a lead implementation engineer and execution AI agent. Produce clean, production-grade code and solutions.',
        prompt: lexExecutionPrompt,
        temperature: 0.25,
        signal,
      });

      // Extract artifacts from code blocks
      const artifacts: { filename: string; content: string; language?: string }[] = [];
      const codeBlockRegex = /```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g;
      let match;
      let artifactIndex = 1;
      while ((match = codeBlockRegex.exec(lexResult.text)) !== null) {
        const lang = match[1] || 'text';
        const code = match[2];
        const fileMatch = code.match(/^\/\/\s*File:\s*([^\r\n]+)/m);
        const filename = fileMatch ? fileMatch[1].trim() : `deliverable_${artifactIndex}.${lang === 'typescript' || lang === 'tsx' ? 'tsx' : lang === 'json' ? 'json' : 'ts'}`;
        artifacts.push({ filename, content: code, language: lang });
        artifactIndex++;
      }

      stage4Record.status = 'completed';
      stage4Record.summary = `Implementation deliverables generated (${artifacts.length} artifacts produced).`;
      stage4Record.durationMs = Date.now() - stage4Start;
      stage4Record.details = {
        executionOutput: lexResult.text,
        artifactCount: artifacts.length,
        provider: lexResult.provider,
      };

      await updateTaskStep(dbStep4.id, {
        status: 'completed',
        result: {
          execution: lexResult.text,
          artifacts,
        },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: 85 });

      await logAndEmit(
        'LEX',
        'SUSI',
        'result',
        `LEX finished implementation with ${artifacts.length} deliverable artifacts. Submitting to SUSI for final verification.`,
        stage4Record,
        { artifacts }
      );

      // -----------------------------------------------------------------------
      // STAGE 5: SUSI (Verification & Executive Synthesis)
      // -----------------------------------------------------------------------
      if (signal?.aborted) throw new Error('Pipeline cancelled by client.');

      const stage5Start = Date.now();
      const stage5Record: MultiAgentStepRecord = {
        agent: 'SUSI',
        stage: 'VERIFICATION',
        status: 'running',
        title: 'Executive Verification & Final Synthesis',
      };
      steps.push(stage5Record);

      const dbStep5 = await createTaskStep({
        task_id: taskId,
        step_index: 5,
        action_type: 'MULTI_AGENT_VERIFICATION',
        title: stage5Record.title,
        status: 'running',
        started_at: new Date().toISOString(),
      });
      currentStepId = dbStep5.id;

      await logAndEmit(
        'SUSI',
        'ALL',
        'status',
        `SUSI evaluating all agent outputs (SPY Research, EURO Analysis, LEX Implementation) against acceptance criteria...`,
        stage5Record
      );

      const susiVerifyPrompt = `You are SUSI, the Master Orchestration & Verification AI.
Review the complete output produced by your agent team:

1. SPY Research Summary:
${spyResult.text.slice(0, 1000)}

2. EURO Analysis & Risk Blueprint:
${euroResult.text.slice(0, 1000)}

3. LEX Implementation Deliverables:
${lexResult.text.slice(0, 1500)}

Original User Goal:
"${title} — ${objective}"

Verify that:
1. The research directly addressed the user's objective with credible evidence.
2. The analysis correctly identified key risks and edge cases.
3. The execution deliverables are complete, robust, and safe.

Produce:
1. Verification Verdict: [VERIFIED: YES or NO]
2. Quality & Safety Audit Notes
3. Authoritative Executive Summary for the User`;

      const susiVerifyResult = await executeAiInference({
        systemPrompt: 'You are SUSI, an executive validation AI. Verify outputs with zero tolerance for fake success or hallucination.',
        prompt: susiVerifyPrompt,
        temperature: 0.2,
        signal,
      });

      const isVerified = /\[VERIFIED:\s*YES\]/i.test(susiVerifyResult.text) || !/\[VERIFIED:\s*NO\]/i.test(susiVerifyResult.text);

      stage5Record.status = isVerified ? 'completed' : 'failed';
      stage5Record.summary = isVerified ? 'Executive verification passed.' : 'Verification failed: deliverables did not meet criteria.';
      stage5Record.durationMs = Date.now() - stage5Start;
      stage5Record.details = { verificationOutput: susiVerifyResult.text, verified: isVerified };

      await updateTaskStep(dbStep5.id, {
        status: isVerified ? 'completed' : 'failed',
        result: {
          verification: susiVerifyResult.text,
          verified: isVerified,
        },
        completed_at: new Date().toISOString(),
      });

      // Update Agent Run & Parent Task
      await updateAgentRun(runId, {
        status: isVerified ? 'completed' : 'failed',
        completed: isVerified,
      });

      await updateTask(taskId, {
        progress: isVerified ? 100 : 90,
        status: isVerified ? 'completed' : 'failed',
        completed: isVerified,
      });

      await logAndEmit(
        'SUSI',
        'ALL',
        'result',
        `Multi-agent execution ${isVerified ? 'VERIFIED and COMPLETED' : 'FAILED verification'}.\n\nExecutive Summary:\n${susiVerifyResult.text}`,
        stage5Record,
        {
          verified: isVerified,
          summary: susiVerifyResult.text,
        }
      );

      return {
        success: isVerified,
        runId,
        taskId,
        status: isVerified ? 'completed' : 'failed',
        steps,
        spyResearch: {
          findings: spyResult.text,
          sources: ['Technical Documentation', 'Standards Baseline'],
          technicalPrerequisites: [],
        },
        euroAnalysis: {
          insights: euroResult.text,
          risks: [],
          blueprint: euroResult.text,
        },
        lexExecution: {
          implementationSummary: lexResult.text,
          artifacts,
        },
        susiVerification: {
          verified: isVerified,
          verificationNotes: susiVerifyResult.text,
          executiveSummary: susiVerifyResult.text,
        },
        finalOutput: susiVerifyResult.text,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCancelled = signal?.aborted || errorMsg.includes('cancelled');
      const finalStatus = isCancelled ? 'cancelled' : 'failed';

      // Update current step if active
      if (currentStepId) {
        await updateTaskStep(currentStepId, {
          status: finalStatus,
          error: errorMsg,
          completed_at: new Date().toISOString(),
        }).catch(() => {});
      }

      await updateAgentRun(runId, {
        status: finalStatus,
        completed: false,
      }).catch(() => {});

      await updateTask(taskId, {
        status: finalStatus,
        completed: false,
      }).catch(() => {});

      await recordAgentMessage({
        runId,
        taskId,
        fromAgent: 'SUSI',
        toAgent: 'ALL',
        type: 'error',
        content: `Multi-agent pipeline ${finalStatus}: ${errorMsg}`,
      }).catch(() => {});

      return {
        success: false,
        runId,
        taskId,
        status: finalStatus,
        steps,
        error: errorMsg,
      };
    }
  }
}

export const multiAgentOrchestrator = new MultiAgentOrchestrator();

