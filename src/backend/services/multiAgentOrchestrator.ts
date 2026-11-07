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
import { researchRetrievalService, ResearchRetrievalResult } from './researchRetrievalService';
import { workspaceFileWriter, FileWriteResult, TrustedOverwriteApproval } from './workspaceFileWriter';
import { scrubSensitiveString, scrubSensitiveData } from './credentialScrubber';
import { analyzeGeneratedArtifacts } from './artifactStaticAnalysisService';
import type { Json, AgentMessage } from '@/backend/types/database';

export { scrubSensitiveString, scrubSensitiveData };

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
  userId?: string | null;
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
    retrievalStatus: 'retrieved' | 'unavailable' | 'no_results';
  };
  euroAnalysis?: {
    insights: string;
    risks: string[];
    blueprint: string;
  };
  lexExecution?: {
    implementationSummary: string;
    executionMode: 'artifacts_generated' | 'file_write_applied' | 'file_write_partial_or_rejected';
    artifacts: { filename: string; content: string; language?: string }[];
    fileOperations?: FileWriteResult[];
    verifiedFilesCount?: number;
  };
  susiVerification?: {
    verified: boolean;
    verificationVerdict: 'VERIFIED_PASS' | 'VERIFIED_FAIL';
    acceptanceCriteriaMet: boolean;
    auditNotes: string;
    executiveSummary: string;
  };
  finalOutput?: string;
  error?: string;
}



/**
 * Combines multiple AbortSignals safely.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

export class MultiAgentOrchestrator {
  private activePipelines = new Map<string, AbortController>();

  /**
   * Proactively cancels an active running pipeline by taskId.
   */
  public cancelPipeline(taskId: string, reason = 'Pipeline cancelled by client.'): boolean {
    const controller = this.activePipelines.get(taskId);
    if (controller) {
      controller.abort(new Error(reason));
      this.activePipelines.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * Executes the complete 5-stage multi-agent pipeline.
   */
  async executePipeline(input: MultiAgentPipelineInput): Promise<MultiAgentPipelineResult> {
    const { taskId, title, objective, userId = null, context = {}, signal, onProgress } = input;
    const steps: MultiAgentStepRecord[] = [];
    let currentStepId: string | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    // Create internal controller and register pipeline
    const internalController = new AbortController();
    this.activePipelines.set(taskId, internalController);

    const activeSignal = signal ? anySignal([signal, internalController.signal]) : internalController.signal;

    // Check cancellation before start
    if (activeSignal.aborted) {
      this.activePipelines.delete(taskId);
      throw new Error('Pipeline cancelled before execution started.');
    }

    // 1. Initialize Agent Run with owner identity
    let runId: string;
    try {
      runId = await createAgentRun(
        taskId,
        [
          { step: 1, agent: 'SUSI', role: 'Task Decomposition & Planning' },
          { step: 2, agent: 'SPY', role: 'Deep Research & Technical Intelligence' },
          { step: 3, agent: 'EURO', role: 'Analytical Synthesis & Risk Blueprint' },
          { step: 4, agent: 'LEX', role: 'Implementation Deliverables & Execution' },
          { step: 5, agent: 'SUSI', role: 'Structured Verification & Audit' },
        ],
        userId
      );

      await updateAgentRun(runId, { status: 'planning' });
      await updateTask(taskId, { progress: 5, status: 'in_progress', completed: false });
    } catch (initializationError) {
      this.activePipelines.delete(taskId);
      throw initializationError;
    }

    // Persist a heartbeat while the pipeline is active so a recovery worker can distinguish
    // a live long-running task from a process that died between stages.
    heartbeatTimer = setInterval(() => {
      void updateAgentRun(runId, { status: 'running' }).catch((error) => {
        console.error('[MultiAgentOrchestrator] Agent heartbeat persistence failed:', error);
      });
    }, 20_000);

    // Helper to log scrubbed message and trigger progress
    const logAndEmit = async (
      agent: WorkforceAgentId,
      toAgent: WorkforceAgentId | 'ALL',
      type: 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note',
      content: string,
      stageRecord: MultiAgentStepRecord,
      metadata?: Json
    ): Promise<AgentMessage> => {
      const scrubbedContent = scrubSensitiveData(content);
      const scrubbedMetadata = metadata
        ? (JSON.parse(scrubSensitiveData(JSON.stringify(metadata))) as Json)
        : undefined;
      const msg = await recordAgentMessage({
        runId,
        taskId,
        fromAgent: agent,
        toAgent,
        type,
        content: scrubbedContent,
        metadata: scrubbedMetadata,
      });
      onProgress?.(stageRecord, msg);
      return msg;
    };

    try {
      // -----------------------------------------------------------------------
      // STAGE 1: SUSI (Manager / Planning)
      // -----------------------------------------------------------------------
      if (activeSignal.aborted) throw new Error('Pipeline cancelled before planning.');

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
Context: ${scrubSensitiveData(JSON.stringify(context))}

Respond in structured format with clear directives for each agent.`;

      const planResult = await executeAiInference({
        systemPrompt: 'You are SUSI, the executive manager of an autonomous multi-agent intelligence swarm.',
        prompt: susiPlanPrompt,
        temperature: 0.3,
        signal: activeSignal,
      });

      if (activeSignal.aborted) throw new Error('Pipeline cancelled during planning.');

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
      await updateAgentRun(runId, { status: 'running' });

      await logAndEmit(
        'SUSI',
        'SPY',
        'assignment',
        `Dispatched Research Directive to SPY:\n${planResult.text.slice(0, 400)}...`,
        stage1Record,
        { plan: planResult.text }
      );

      // -----------------------------------------------------------------------
      // STAGE 2: SPY (Research & Genuine Technical Retrieval)
      // -----------------------------------------------------------------------
      if (activeSignal.aborted) throw new Error('Pipeline cancelled before research.');

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
        `SPY initiating genuine search and retrieval for "${title}"...`,
        stage2Record
      );

      // 2.1 Genuine Technical Retrieval using researchRetrievalService
      const retrievalEvidence: ResearchRetrievalResult = await researchRetrievalService.retrieveEvidence(
        objective || title,
        { signal: activeSignal, maxResults: 5 }
      );

      const verifiedSourcesText =
        retrievalEvidence.sources.length > 0
          ? retrievalEvidence.sources
              .map((s, idx) => `[Source ${idx + 1}] ${s.title}\nURL: ${s.url}\nExcerpt: ${s.snippet}`)
              .join('\n\n')
          : `NOTICE: External research retrieval tool status: ${retrievalEvidence.toolStatus.toUpperCase()} (${
              retrievalEvidence.diagnosticNotes || 'No live web results retrieved'
            }). You must explicitly report that citations reflect base model training and live web citations are unavailable. Do not fabricate URLs.`;

      const spyResearchPrompt = `You are SPY, the Specialized Research & Technical Intelligence Agent of SUSI AI.
Your directive from SUSI:
${planResult.text}

User Objective:
"${objective}"

Genuine Retrieval Evidence Available:
----------------------------------------
${verifiedSourcesText}
----------------------------------------

Conduct thorough, factual technical research based on verified evidence:
Guidelines:
- If genuine sources were retrieved above, base your findings on them and cite their exact URLs.
- If retrieval tools were unavailable, explicitly declare: "Live web retrieval unavailable; findings reflect offline architectural baseline."
- Never fabricate fake URLs, hallucinated APIs, or fictitious papers.
- Detail concrete technical standards, prerequisites, and compatibility considerations.

Provide:
1. Core Technical Findings & Standards
2. Genuine Citations & Evidence (List only authentic URLs from above or state none)
3. Technical Prerequisites & Dependencies`;

      const spyResult = await executeAiInference({
        systemPrompt:
          'You are SPY, an elite technical intelligence AI agent. Strict factual accuracy. Never generate fictitious citations.',
        prompt: spyResearchPrompt,
        temperature: 0.2,
        signal: activeSignal,
      });

      if (activeSignal.aborted) throw new Error('Pipeline cancelled during research.');

      stage2Record.status = 'completed';
      stage2Record.summary =
        retrievalEvidence.sources.length > 0
          ? `Research completed with ${retrievalEvidence.sources.length} genuine retrieved sources.`
          : 'Research completed with offline baseline (live retrieval unavailable).';
      stage2Record.durationMs = Date.now() - stage2Start;
      stage2Record.details = {
        researchOutput: spyResult.text,
        provider: spyResult.provider,
        sourcesCount: retrievalEvidence.sources.length,
        retrievalStatus: retrievalEvidence.toolStatus,
      };

      const authenticSourceUrls = retrievalEvidence.sources.map((s) => s.url);

      await saveAgentMemory('SPY', `research_${taskId}`, {
        title,
        summary: spyResult.text.slice(0, 500),
        sources: authenticSourceUrls,
        retrievalStatus: retrievalEvidence.toolStatus,
      });

      await updateTaskStep(dbStep2.id, {
        status: 'completed',
        result: {
          research: spyResult.text,
          sources: authenticSourceUrls,
          retrievalStatus: retrievalEvidence.toolStatus,
        },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: 45 });

      await logAndEmit(
        'SPY',
        'EURO',
        'handoff',
        `SPY completed research (${retrievalEvidence.sources.length} verified sources). Handing off to EURO:\n${spyResult.text.slice(0, 350)}...`,
        stage2Record,
        { sources: authenticSourceUrls, retrievalStatus: retrievalEvidence.toolStatus }
      );

      // -----------------------------------------------------------------------
      // STAGE 3: EURO (Analysis & Synthesis)
      // -----------------------------------------------------------------------
      if (activeSignal.aborted) throw new Error('Pipeline cancelled before analysis.');

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
        systemPrompt:
          'You are EURO, an analytical synthesis AI agent specializing in risk assessment, pattern detection, and blueprint architecture.',
        prompt: euroAnalysisPrompt,
        temperature: 0.2,
        signal: activeSignal,
      });

      if (activeSignal.aborted) throw new Error('Pipeline cancelled during analysis.');

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
      // STAGE 4: LEX (Execution & Safe Workspace File Operations)
      // -----------------------------------------------------------------------
      if (activeSignal.aborted) throw new Error('Pipeline cancelled before execution.');

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
        `LEX building implementation deliverables based on EURO's blueprint...`,
        stage4Record
      );

      const lexExecutionPrompt = `You are LEX, the Lead Implementation & Execution Agent of SUSI AI.
EURO has provided the following execution blueprint:
----------------------------------------
${euroResult.text}
----------------------------------------

Original User Goal:
"${title} — ${objective}"

Build complete, production-ready implementation deliverables for this request.
Guidelines:
- Provide clean, functional code or configuration in markdown code blocks.
- Include exact file paths in code headers: // File: src/components/... or // File: src/lib/...
- Adhere to the project stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4.
- Follow strict security controls: no forbidden OS commands, no sensitive credentials.

Provide:
1. Executive Technical Summary of Deliverables
2. Complete Implementation Artifacts (Code / Config / Steps)
3. Verification & Validation Steps`;

      let lexResult = await executeAiInference({
        systemPrompt:
          'You are LEX, a lead implementation engineer and execution AI agent. Produce clean, production-grade code and solutions.',
        prompt: lexExecutionPrompt,
        temperature: 0.25,
        signal: activeSignal,
      });

      if (activeSignal.aborted) throw new Error('Pipeline cancelled during execution.');

      // Extract artifacts from code blocks
      const artifacts: { filename: string; content: string; language?: string }[] = [];
      const codeBlockRegex = /```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g;
      let match;
      let artifactIndex = 1;
      while ((match = codeBlockRegex.exec(lexResult.text)) !== null) {
        const lang = match[1] || 'text';
        const code = match[2];
          const fileMatch = code.match(/^\/\/\s*File:\s*([^\r\n]+)/m);
        const filename = fileMatch
          ? fileMatch[1].trim()
          : `deliverable_${artifactIndex}.${lang === 'typescript' || lang === 'tsx' ? 'tsx' : lang === 'json' ? 'json' : 'ts'}`;
        artifacts.push({ filename, content: code, language: lang });
        artifactIndex++;
      }

      // EURO's deterministic review gate: parse generated source before any disk write.
      if (artifacts.length === 0) {
        throw new Error('LEX produced no parseable file artifacts; refusing to report implementation success.');
      }
      let staticAnalysis = analyzeGeneratedArtifacts(artifacts);
      const maxLexCorrectionPasses = 2;
      let lexCorrectionPass = 0;

      while (!staticAnalysis.passed && lexCorrectionPass < maxLexCorrectionPasses) {
        lexCorrectionPass += 1;
        await logAndEmit(
          'EURO',
          'LEX',
          'status',
          `EURO found static-analysis errors. Sending bounded correction pass ${lexCorrectionPass}/${maxLexCorrectionPasses} to LEX: ${staticAnalysis.summary}`,
          stage3Record,
          { correctionPass: lexCorrectionPass, diagnostics: staticAnalysis.diagnostics as unknown as Json }
        );

        const correction = await executeAiInference({
          systemPrompt: 'You are LEX. Correct the supplied artifacts exactly. Return complete corrected files in fenced code blocks with // File: paths. Do not claim tests or builds were run.',
          prompt: `EURO static-analysis findings (pass ${lexCorrectionPass}):
${JSON.stringify(staticAnalysis.diagnostics, null, 2)}

Original objective: ${title} — ${objective}

Previous deliverables:
${lexResult.text}

Return corrected complete artifacts only. Preserve every required file path and include the complete file contents.`,
          temperature: 0.1,
          signal: activeSignal,
        });
        if (activeSignal.aborted) throw new Error('Pipeline cancelled during LEX correction.');

        lexResult = correction;
        artifacts.length = 0;
        artifactIndex = 1;
        codeBlockRegex.lastIndex = 0;
        while ((match = codeBlockRegex.exec(lexResult.text)) !== null) {
          const lang = match[1] || 'text';
          const code = match[2];
          const fileMatch = code.match(/^\/\/\s*File:\s*([^\r\n]+)/m);
          const filename = fileMatch
            ? fileMatch[1].trim()
            : `deliverable_${artifactIndex}.${lang === 'typescript' || lang === 'tsx' ? 'tsx' : lang === 'json' ? 'json' : 'ts'}`;
          artifacts.push({ filename, content: code, language: lang });
          artifactIndex++;
        }

        if (artifacts.length === 0) {
          throw new Error(`LEX correction pass ${lexCorrectionPass} returned no parseable file artifacts.`);
        }
        staticAnalysis = analyzeGeneratedArtifacts(artifacts);
      }

      await logAndEmit(
        'EURO',
        'LEX',
        staticAnalysis.passed ? 'result' : 'error',
        `EURO static analysis: ${staticAnalysis.summary}`,
        stage3Record,
        { checked: staticAnalysis.checked, passed: staticAnalysis.passed, diagnostics: staticAnalysis.diagnostics as unknown as Json }
      );

      // Check whether actual workspace file writes were explicitly requested
      const shouldApplyFiles = Boolean(
        context.applyChanges || context.writeToDisk || context.executeFileChanges
      );

      const fileResults: FileWriteResult[] = [];
      let verifiedFilesCount = 0;

      if (shouldApplyFiles) {
        if (typeof context.workspaceRoot !== 'string' || !context.workspaceRoot.trim()) {
          throw new Error('Workspace file application requires an explicitly selected workspaceRoot; refusing to write into the server working directory.');
        }
        for (const art of artifacts) {
          const writeRes = await workspaceFileWriter.writeFile(art.filename, art.content, {
            workspaceRoot: context.workspaceRoot,
            taskId,
            userId: userId || undefined,
            trustedApproval: context.trustedApproval as TrustedOverwriteApproval | undefined,
          });
          fileResults.push(writeRes);
          if (writeRes.verified) {
            verifiedFilesCount++;
          }
        }
      }

      let executionMode = shouldApplyFiles
        ? verifiedFilesCount === fileResults.length && fileResults.length > 0
          ? 'file_write_applied'
          : 'file_write_partial_or_rejected'
        : 'artifacts_generated';

      let allRequestedFilesSucceeded = staticAnalysis.passed && (!shouldApplyFiles || (verifiedFilesCount === fileResults.length && fileResults.length > 0));

      stage4Record.status = allRequestedFilesSucceeded ? 'completed' : 'failed';
      stage4Record.summary = shouldApplyFiles
        ? `Workspace files applied: ${verifiedFilesCount}/${fileResults.length} read-back verified.`
        : `Code deliverables generated in-memory (${artifacts.length} artifacts produced). Disk write not requested.`;
      stage4Record.durationMs = Date.now() - stage4Start;
      stage4Record.details = {
        executionOutput: lexResult.text,
        artifactCount: artifacts.length,
        executionMode,
        fileOperations: fileResults as unknown as Json,
        verifiedFilesCount,
        provider: lexResult.provider,
      };

      await updateTaskStep(dbStep4.id, {
        status: allRequestedFilesSucceeded ? 'completed' : 'failed',
        result: {
          execution: lexResult.text,
          artifacts,
          executionMode,
          fileOperations: fileResults as unknown as Json,
          verifiedFilesCount,
        },
        completed_at: new Date().toISOString(),
      });
      await updateTask(taskId, { progress: allRequestedFilesSucceeded ? 85 : 80 });

      await logAndEmit(
        'LEX',
        'SUSI',
        allRequestedFilesSucceeded ? 'result' : 'error',
        shouldApplyFiles
          ? `LEX applied and verified ${verifiedFilesCount}/${fileResults.length} workspace files on disk.`
          : `LEX generated ${artifacts.length} in-memory code artifacts. Submitting to SUSI for verification.`,
        stage4Record,
        { artifacts, executionMode, fileOperations: fileResults as unknown as Json }
      );

      // -----------------------------------------------------------------------
      // STAGE 5: SUSI (Structured Verification & Strict Criteria Audit)
      // -----------------------------------------------------------------------
      if (activeSignal.aborted) throw new Error('Pipeline cancelled before verification.');

      const stage5Start = Date.now();
      const stage5Record: MultiAgentStepRecord = {
        agent: 'SUSI',
        stage: 'VERIFICATION',
        status: 'running',
        title: 'Structured Verification & Executive Audit',
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
        `SUSI auditing team outputs against acceptance criteria with strict structured validation...`,
        stage5Record
      );

      const susiVerifyPrompt = `You are SUSI, the Master Orchestration & Verification AI.
Audit the outputs produced by your agent team:

1. SPY Research Summary:
${spyResult.text.slice(0, 1000)}
Genuine Sources Retrieved: ${authenticSourceUrls.join(', ') || 'None (offline baseline)'}

2. EURO Analysis & Risk Blueprint:
${euroResult.text.slice(0, 1000)}

3. LEX Implementation Deliverables:
Mode: ${executionMode}
Artifacts Generated: ${artifacts.length}
${shouldApplyFiles ? `Files Written & Verified on Disk: ${verifiedFilesCount}/${fileResults.length}` : 'Execution: Artifact generation only (no files written to disk)'}
${lexResult.text.slice(0, 1500)}

Original User Goal:
"${title} — ${objective}"

Strict Verification Rules:
- Verification must strictly fail if deliverables do not address the acceptance criteria.
- Verification must fail if file changes were requested but rejected or unverified.
- Never grant a pass if the verdict is ambiguous or incomplete.

You MUST end your output with a strict JSON evaluation block in exactly this format:
\`\`\`json
{
  "verdict": "VERIFIED_PASS" or "VERIFIED_FAIL",
  "acceptanceCriteriaMet": true or false,
  "evidenceCredible": true or false,
  "fileOperationsVerified": true or false,
  "auditNotes": "Concise explanation of audit findings",
  "executiveSummary": "High-level summary for the user"
}
\`\`\``;

      let susiVerifyResult = await executeAiInference({
        systemPrompt:
          'You are SUSI, an executive validation AI. Zero tolerance for fake success or hallucination. Require explicit structured evaluation.',
        prompt: susiVerifyPrompt,
        temperature: 0.1,
        signal: activeSignal,
      });

      if (activeSignal.aborted) throw new Error('Pipeline cancelled during verification.');

      // Strict Structured Verdict Parser (no permissive regex!)
      let parsedVerdict: {
        verdict?: string;
        acceptanceCriteriaMet?: boolean;
        evidenceCredible?: boolean;
        fileOperationsVerified?: boolean;
        auditNotes?: string;
        executiveSummary?: string;
      } | null = null;

      try {
        const jsonMatch = susiVerifyResult.text.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          parsedVerdict = JSON.parse(jsonMatch[1]);
        } else {
          // Attempt raw JSON parse
          const rawMatch = susiVerifyResult.text.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
          if (rawMatch) {
            parsedVerdict = JSON.parse(rawMatch[0]);
          }
        }
      } catch {
        parsedVerdict = null;
      }

      // Explicit validation check: missing, incomplete, or ambiguous verdicts MUST FAIL
      let hasPassVerdict = parsedVerdict?.verdict === 'VERIFIED_PASS';
      let criteriaMet = parsedVerdict?.acceptanceCriteriaMet === true;
      let fileCheckPassed = shouldApplyFiles
        ? parsedVerdict?.fileOperationsVerified === true && verifiedFilesCount === fileResults.length && fileResults.length > 0
        : true;

      let evidenceCheckPassed = parsedVerdict?.evidenceCredible === true;
      let isVerified = Boolean(
        parsedVerdict &&
          hasPassVerdict &&
          criteriaMet &&
          evidenceCheckPassed &&
          fileCheckPassed &&
          allRequestedFilesSucceeded
      );

      // Bounded SUSI -> LEX correction -> EURO re-review -> SUSI re-verification loop.
      // Never runs more than two correction passes and never bypasses deterministic static analysis.
      const maxSusiCorrectionPasses = 2;
      let susiCorrectionPass = 0;
      while (!isVerified && susiCorrectionPass < maxSusiCorrectionPasses && !activeSignal.aborted) {
        susiCorrectionPass += 1;
        const feedback = parsedVerdict?.auditNotes || 'SUSI returned an incomplete or failed verification verdict.';
        await logAndEmit(
          'SUSI',
          'LEX',
          'handoff',
          `SUSI rejected the current deliverables. Sending bounded correction pass ${susiCorrectionPass}/${maxSusiCorrectionPasses}: ${feedback}`,
          stage5Record,
          { correctionPass: susiCorrectionPass, feedback }
        );

        const correction = await executeAiInference({
          systemPrompt: 'You are LEX. Apply SUSI audit feedback to the complete files. Return complete corrected files only, each in a fenced code block with // File: relative/path. Do not claim tests or builds were run.',
          prompt: `Original task: ${title} — ${objective}
SUSI audit feedback: ${feedback}
Previous artifacts:
${artifacts.map((item) => `FILE: ${item.filename}\\n${item.content}`).join('\\n\\n')}
Return the corrected complete files with their original paths.`,
          temperature: 0.1,
          signal: activeSignal,
        });
        if (activeSignal.aborted) throw new Error('Pipeline cancelled during SUSI-directed LEX correction.');

        lexResult = correction;
        artifacts.length = 0;
        artifactIndex = 1;
        codeBlockRegex.lastIndex = 0;
        while ((match = codeBlockRegex.exec(lexResult.text)) !== null) {
          const lang = match[1] || 'text';
          const code = match[2];
          const fileMatch = code.match(/^\/\/\s*File:\s*([^\r\n]+)/m);
          const filename = fileMatch ? fileMatch[1].trim() : `deliverable_${artifactIndex}.${lang === 'typescript' || lang === 'tsx' ? 'tsx' : lang === 'json' ? 'json' : 'ts'}`;
          artifacts.push({ filename, content: code, language: lang });
          artifactIndex += 1;
        }
        if (!artifacts.length) {
          throw new Error(`LEX SUSI correction pass ${susiCorrectionPass} returned no complete file artifacts.`);
        }

        staticAnalysis = analyzeGeneratedArtifacts(artifacts);
        await logAndEmit(
          'EURO',
          'LEX',
          staticAnalysis.passed ? 'result' : 'error',
          `EURO re-review pass ${susiCorrectionPass}: ${staticAnalysis.summary}`,
          stage3Record,
          { correctionPass: susiCorrectionPass, passed: staticAnalysis.passed, diagnostics: staticAnalysis.diagnostics as unknown as Json }
        );
        if (!staticAnalysis.passed) {
          parsedVerdict = { verdict: 'VERIFIED_FAIL', acceptanceCriteriaMet: false, evidenceCredible: false, auditNotes: `EURO static analysis rejected corrected artifacts: ${staticAnalysis.summary}` };
          hasPassVerdict = false;
          criteriaMet = false;
          evidenceCheckPassed = false;
          isVerified = false;
          continue;
        }

        if (shouldApplyFiles) {
          fileResults.length = 0;
          verifiedFilesCount = 0;
          for (const art of artifacts) {
            const writeRes = await workspaceFileWriter.writeFile(art.filename, art.content, {
              workspaceRoot: context.workspaceRoot as string,
              taskId,
              userId: userId || undefined,
              trustedApproval: context.trustedApproval as TrustedOverwriteApproval | undefined,
            });
            fileResults.push(writeRes);
            if (writeRes.verified) verifiedFilesCount += 1;
          }
        }
        allRequestedFilesSucceeded = staticAnalysis.passed &&
          (!shouldApplyFiles || (verifiedFilesCount === fileResults.length && fileResults.length > 0));
        executionMode = shouldApplyFiles
          ? allRequestedFilesSucceeded ? 'file_write_applied' : 'file_write_partial_or_rejected'
          : 'artifacts_generated';
        stage4Record.status = allRequestedFilesSucceeded ? 'completed' : 'failed';
        stage4Record.summary = shouldApplyFiles
          ? `Workspace files applied after correction: ${verifiedFilesCount}/${fileResults.length} read-back verified.`
          : `Corrected ${artifacts.length} code artifacts in-memory; no disk write was requested.`;
        stage4Record.details = {
          executionOutput: lexResult.text,
          artifactCount: artifacts.length,
          executionMode,
          fileOperations: fileResults as unknown as Json,
          verifiedFilesCount,
          provider: lexResult.provider,
        };
        await updateTaskStep(dbStep4.id, {
          status: allRequestedFilesSucceeded ? 'completed' : 'failed',
          result: { execution: lexResult.text, artifacts, executionMode, fileOperations: fileResults as unknown as Json, verifiedFilesCount },
          completed_at: new Date().toISOString(),
        });
        if (!allRequestedFilesSucceeded) {
          parsedVerdict = { verdict: 'VERIFIED_FAIL', acceptanceCriteriaMet: false, evidenceCredible: false, auditNotes: 'Corrected files were not all written and read-back verified.' };
          hasPassVerdict = false;
          criteriaMet = false;
          fileCheckPassed = false;
          evidenceCheckPassed = false;
          isVerified = false;
          continue;
        }

        const euroReview = await executeAiInference({
          systemPrompt: 'You are EURO, an independent implementation reviewer. Review the revised artifacts against the original objective and SUSI feedback. Identify remaining gaps. End with JSON {"review":"PASS"|"FAIL","findings":"..."}; PASS only when the files address the feedback and no critical gap remains.',
          prompt: `Task: ${title} — ${objective}
SUSI feedback: ${feedback}
Static analysis: ${staticAnalysis.summary}
Revised files:
${artifacts.map((item) => `FILE: ${item.filename}\\n${item.content}`).join('\\n\\n')}`,
          temperature: 0.1,
          signal: activeSignal,
        });
        const euroReviewMatch = euroReview.text.match(/\{[\s\S]*"review"[\s\S]*\}/);
        let euroReviewPassed = false;
        if (euroReviewMatch) {
          try { euroReviewPassed = JSON.parse(euroReviewMatch[0]).review === 'PASS'; } catch { euroReviewPassed = false; }
        }
        if (!euroReviewPassed) {
          parsedVerdict = { verdict: 'VERIFIED_FAIL', acceptanceCriteriaMet: false, evidenceCredible: false, auditNotes: `EURO re-review did not approve the correction: ${euroReview.text.slice(0, 500)}` };
          hasPassVerdict = false;
          criteriaMet = false;
          fileCheckPassed = !shouldApplyFiles || (verifiedFilesCount === fileResults.length && fileResults.length > 0);
          evidenceCheckPassed = false;
          isVerified = false;
          continue;
        }

        susiVerifyResult = await executeAiInference({
          systemPrompt: 'You are SUSI, the final independent verification authority. Return a strict JSON verdict. Never pass without credible evidence and verified file operations.',
          prompt: `Re-audit the corrected artifacts after EURO approved them.
Original task: ${title} — ${objective}
Previous audit feedback: ${feedback}
EURO review: ${euroReview.text}
Artifacts: ${artifacts.map((item) => `${item.filename}: ${item.content.slice(0, 5000)}`).join('\\n\\n')}
File write requested: ${shouldApplyFiles}
Read-back verified: ${verifiedFilesCount}/${fileResults.length}
Return exactly one JSON object with verdict, acceptanceCriteriaMet, evidenceCredible, fileOperationsVerified, auditNotes, executiveSummary.`,
          temperature: 0.1,
          signal: activeSignal,
        });
        parsedVerdict = null;
        try {
          const fenced = susiVerifyResult.text.match(/```json\s*([\s\S]*?)\s*```/);
          const raw = fenced?.[1] || susiVerifyResult.text.match(/\{[\s\S]*"verdict"[\s\S]*\}/)?.[0];
          if (raw) parsedVerdict = JSON.parse(raw);
        } catch { parsedVerdict = null; }
        hasPassVerdict = parsedVerdict?.verdict === 'VERIFIED_PASS';
        criteriaMet = parsedVerdict?.acceptanceCriteriaMet === true;
        fileCheckPassed = shouldApplyFiles
          ? parsedVerdict?.fileOperationsVerified === true && verifiedFilesCount === fileResults.length && fileResults.length > 0
          : true;
        evidenceCheckPassed = parsedVerdict?.evidenceCredible === true;
        isVerified = Boolean(parsedVerdict && hasPassVerdict && criteriaMet && evidenceCheckPassed && fileCheckPassed && allRequestedFilesSucceeded);
      }

      const finalVerdictString: 'VERIFIED_PASS' | 'VERIFIED_FAIL' = isVerified ? 'VERIFIED_PASS' : 'VERIFIED_FAIL';
      const auditNotes = parsedVerdict?.auditNotes || (isVerified ? 'All criteria satisfied.' : 'Verification failed: missing, unsupported, or rejected criteria/evidence.');
      const executiveSummary = parsedVerdict?.executiveSummary || susiVerifyResult.text;

      stage5Record.status = isVerified ? 'completed' : 'failed';
      stage5Record.summary = isVerified
        ? 'Executive verification PASSED: Acceptance criteria confirmed.'
        : `Executive verification FAILED: ${auditNotes}`;
      stage5Record.durationMs = Date.now() - stage5Start;
      stage5Record.details = {
        verificationOutput: susiVerifyResult.text,
        verified: isVerified,
        parsedVerdict: parsedVerdict as unknown as Json,
      };

      await updateTaskStep(dbStep5.id, {
        status: isVerified ? 'completed' : 'failed',
        result: {
          verification: susiVerifyResult.text,
          verified: isVerified,
          verdict: finalVerdictString,
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
        isVerified ? 'result' : 'error',
        `Multi-agent execution ${isVerified ? 'VERIFIED and COMPLETED' : 'FAILED verification'}.\nVerdict: ${finalVerdictString}\nNotes: ${auditNotes}\n\nExecutive Summary:\n${executiveSummary}`,
        stage5Record,
        {
          verified: isVerified,
          verdict: finalVerdictString,
          summary: executiveSummary,
        }
      );

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.activePipelines.delete(taskId);

      return {
        success: isVerified,
        runId,
        taskId,
        status: isVerified ? 'completed' : 'failed',
        steps,
        spyResearch: {
          findings: spyResult.text,
          sources: authenticSourceUrls,
          technicalPrerequisites: [],
          retrievalStatus: retrievalEvidence.toolStatus,
        },
        euroAnalysis: {
          insights: euroResult.text,
          risks: [],
          blueprint: euroResult.text,
        },
        lexExecution: {
          implementationSummary: lexResult.text,
          executionMode,
          artifacts,
          fileOperations: shouldApplyFiles ? fileResults : undefined,
          verifiedFilesCount,
        },
        susiVerification: {
          verified: isVerified,
          verificationVerdict: finalVerdictString,
          acceptanceCriteriaMet: criteriaMet,
          auditNotes,
          executiveSummary,
        },
        finalOutput: executiveSummary,
      };
    } catch (err: unknown) {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.activePipelines.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isCancelled = activeSignal.aborted || errorMsg.toLowerCase().includes('cancel');
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
        completed: true,
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
