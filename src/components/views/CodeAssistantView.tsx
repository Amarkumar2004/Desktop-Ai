'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Code2,
  Sparkles,
  Play,
  Copy,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  FileCode,
  Layers,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ListOrdered,
  FileText,
  PackageCheck,
  Clock,
  ChevronRight,
  Trash2,
  Eye,
  Info,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import {
  MOCK_CODE_TEMPLATES,
  type CodeTemplate,
} from '@/data/mockCodeAssistant';
import type { ProviderConnectionMetadata } from '@/types/aiProviders';
import {
  getUnifiedModelsList,
  getStoredSelectedModel,
  saveStoredSelectedModel,
  getStoredProviderConnections,
  packageActiveProvidersPayload,
  type UnifiedModelOption,
} from '@/lib/ai/providerVault';
import type {
  CodeAssistantWorkflowState,
  CodeAssistantActivity,
  ImplementationPlan,
  ProposedFile,
} from '@/types/codeAssistant';
import { sanitizeText } from '@/backend/utils/sanitize';
import {
  isUiPreviewSupported,
  generateSafeSandboxHtml,
} from '@/lib/codeAssistant/previewSandbox';
import { useToast } from '@/lib/toast/ToastContext';

interface CodeAssistantViewProps {
  onNavigateToDashboard?: () => void;
}

export default function CodeAssistantView({
  onNavigateToDashboard,
}: CodeAssistantViewProps) {
  const { success, info, warning } = useToast();

  // Input State
  const [requestText, setRequestText] = useState(
    'Build a responsive Next.js login page with email/password fields, validation, and a clean dashboard-style design.'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('Build a component');

  // Workflow State
  const [workflowState, setWorkflowState] = useState<CodeAssistantWorkflowState>('idle');
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [activePlan, setActivePlan] = useState<ImplementationPlan | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(
    'Preview only — no project files were changed.'
  );

  // View Mode: 'code' | 'preview'
  const [activeViewTab, setActiveViewTab] = useState<'code' | 'preview'>('code');
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewRenderKey, setPreviewRenderKey] = useState<number>(0);
  const [previewError, setPreviewError] = useState<boolean>(false);

  // Activity History State
  const [activities, setActivities] = useState<CodeAssistantActivity[]>([
    {
      id: 'act-init-1',
      timestamp: '12:00:00',
      type: 'request_created',
      message: 'Code Assistant initialized in safe preview mode.',
    },
  ]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic AI Providers & Model Selection
  const [connections, setConnections] = useState<ProviderConnectionMetadata[]>([]);
  const [modelOptions, setModelOptions] = useState<UnifiedModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('auto');

  useEffect(() => {
    const conns = getStoredProviderConnections();
    setConnections(conns);
    setModelOptions(getUnifiedModelsList(conns));
    setSelectedModel(getStoredSelectedModel());

    const handleUpdate = () => {
      const updated = getStoredProviderConnections();
      setConnections(updated);
      setModelOptions(getUnifiedModelsList(updated));
      setSelectedModel(getStoredSelectedModel());
    };

    window.addEventListener('susi-providers-updated', handleUpdate);
    window.addEventListener('susi-model-selected', handleUpdate);
    return () => {
      window.removeEventListener('susi-providers-updated', handleUpdate);
      window.removeEventListener('susi-model-selected', handleUpdate);
    };
  }, []);

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    saveStoredSelectedModel(newModel);
    const selectedOpt = modelOptions.find((m) => m.id === newModel);
    addActivity(
      'request_created',
      `Active AI model switched to: ${selectedOpt?.label || newModel}`
    );
  };

  const activeConnection = connections.find(
    (c) => c.status === 'connected' && Boolean(c.rawKey && c.rawKey.trim())
  );

  const addActivity = (
    type: CodeAssistantActivity['type'],
    message: string
  ) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const newAct: CodeAssistantActivity = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: timeStr,
      type,
      message,
    };
    setActivities((prev) => [newAct, ...prev.slice(0, 19)]);
  };

  // Trigger preview reload when switching to preview tab or changing file
  const handleSwitchToPreview = () => {
    setActiveViewTab('preview');
    setPreviewError(false);
    setIsPreviewLoading(true);
    setTimeout(() => {
      setIsPreviewLoading(false);
    }, 350);
  };

  const handleReloadPreview = () => {
    setPreviewError(false);
    setIsPreviewLoading(true);
    setPreviewRenderKey((k) => k + 1);
    setTimeout(() => {
      setIsPreviewLoading(false);
    }, 400);
  };

  // Handle Suggestion Chip Click
  const handleSelectSuggestion = (cat: string) => {
    setSelectedCategory(cat);
    const tmpl = MOCK_CODE_TEMPLATES[cat];
    if (tmpl) {
      setRequestText(tmpl.prompt);
    }
  };

  // Step 1: User Submits "Create Plan"
  const handleCreatePlan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const sanitizedPrompt = sanitizeText(requestText);
    if (!sanitizedPrompt.trim()) return;

    setWorkflowState('thinking');
    setActiveViewTab('code');
    setStatusNotice('Analyzing architecture and building implementation plan...');
    addActivity('request_created', `Submitted prompt: "${sanitizedPrompt.slice(0, 48)}..."`);

    const isPreset =
      MOCK_CODE_TEMPLATES[selectedCategory] &&
      requestText.trim() === MOCK_CODE_TEMPLATES[selectedCategory].prompt.trim();

    let planToUse: ImplementationPlan;

    if (isPreset) {
      const tmpl = MOCK_CODE_TEMPLATES[selectedCategory];
      if (tmpl.clarifications && tmpl.clarifications.length > 0 && Object.keys(clarificationAnswers).length === 0) {
        setTimeout(() => {
          setWorkflowState('needs_clarification');
          setStatusNotice('Clarification requested for optimal code generation.');
          addActivity('clarification_requested', 'AI requested 2 architectural clarifications.');
        }, 600);
        return;
      }
      planToUse = JSON.parse(JSON.stringify(tmpl.plan));
    } else {
      // Dynamic plan generated for custom prompt
      const words = sanitizedPrompt.split(' ').filter(Boolean);
      const cleanName = words.slice(0, 3).join('').replace(/[^a-zA-Z0-9]/g, '');
      const compName = cleanName ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'CustomComponent';

      planToUse = {
        summary: `Implement production-ready ${compName} component according to: "${sanitizedPrompt.slice(0, 80)}" with Tailwind CSS and React 19 best practices.`,
        steps: [
          `1. Parse specifications: "${sanitizedPrompt.slice(0, 60)}..."`,
          `2. Structure clean TypeScript interfaces and accessible interactive primitives.`,
          `3. Style with modern Tailwind utility classes and responsive layouts.`,
          `4. Stream verified component into isolated sandbox for live testing.`,
        ],
        affectedFiles: [`src/components/${compName}.tsx`],
        suggestedDependencies: ['lucide-react', 'react'],
        risksAndNotes: [
          'Preview-only generation: sandbox is strictly isolated from disk.',
          `Connected model: ${selectedModel === 'auto' ? '⚡ Auto-Pilot' : selectedModel}`,
        ],
        proposedFiles: [
          {
            name: `${compName}.tsx`,
            path: `src/components/${compName}.tsx`,
            language: 'tsx',
            description: `Generated UI component for "${sanitizedPrompt.slice(0, 40)}"`,
            code: `// Ready to stream live code from ${selectedModel === 'auto' ? '⚡ Smart Auto-Pilot' : selectedModel}\n// Click "Generate preview" below to start streaming.\n`,
          },
        ],
      };
    }

    setTimeout(() => {
      setActivePlan(planToUse);
      setActiveFileIndex(0);
      setWorkflowState('plan_ready');
      setStatusNotice('Implementation plan ready. Click "Generate preview" to stream live code.');
      addActivity('plan_generated', `Plan created with ${planToUse.affectedFiles.length} affected file(s).`);
    }, 500);
  };

  // Handle Clarification Answer
  const handleAnswerClarification = (qId: string, option: string) => {
    const updated = { ...clarificationAnswers, [qId]: option };
    setClarificationAnswers(updated);

    const tmpl = MOCK_CODE_TEMPLATES[selectedCategory] || MOCK_CODE_TEMPLATES['Build a component'];
    if (tmpl.clarifications && Object.keys(updated).length >= tmpl.clarifications.length) {
      // Proceed to plan
      setWorkflowState('thinking');
      setTimeout(() => {
        setActivePlan(tmpl.plan);
        setActiveFileIndex(0);
        setWorkflowState('plan_ready');
        setStatusNotice('Plan refined with your clarification inputs.');
        addActivity('plan_generated', 'Refined plan generated based on clarifications.');
      }, 700);
    }
  };

  // Step 2: Stream Live Code Preview
  const handleGeneratePreview = async () => {
    if (!activePlan || !activePlan.proposedFiles[activeFileIndex]) return;

    setWorkflowState('generating_code');
    setActiveViewTab('code');
    setStatusNotice('Connecting to AI streaming service...');
    const currentFile = activePlan.proposedFiles[activeFileIndex];
    addActivity('preview_generated', `Initiated live code stream for ${currentFile.name}`);

    let accumulatedCode = '';

    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `You are an expert React UI engineer. Write a complete, standalone, production-quality React component for: "${requestText}".
File: ${currentFile.name}.
Requirements:
1. Export default a React functional component.
2. Use Tailwind CSS classes with modern aesthetics (soft borders, rounded-2xl, subtle shadows, clean typography).
3. Import icons from 'lucide-react' if appropriate.
4. Output ONLY valid TypeScript/JSX code without Markdown fences if possible, or inside a single \`\`\`tsx code block. Do NOT include explanations outside the code block.`,
          mode: 'code',
          selectedModel,
          userProviders: packageActiveProvidersPayload(),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.meta) {
                setStatusNotice(`Streaming from ${data.meta.label} (${data.meta.model})...`);
              }
              if (data.status) {
                setStatusNotice(data.status);
                addActivity('preview_generated', data.status);
              }
              if (data.token) {
                accumulatedCode += data.token;

                // Clean markdown code blocks if the LLM outputted them
                let clean = accumulatedCode;
                if (clean.includes('```tsx')) {
                  clean = clean.split('```tsx')[1]?.split('```')[0] || clean;
                } else if (clean.includes('```jsx')) {
                  clean = clean.split('```jsx')[1]?.split('```')[0] || clean;
                } else if (clean.includes('```typescript')) {
                  clean = clean.split('```typescript')[1]?.split('```')[0] || clean;
                } else if (clean.includes('```')) {
                  clean = clean.split('```')[1]?.split('```')[0] || clean;
                }

                setActivePlan((prev) => {
                  if (!prev) return null;
                  const newFiles = [...prev.proposedFiles];
                  newFiles[activeFileIndex] = {
                    ...newFiles[activeFileIndex],
                    code: clean.trim(),
                  };
                  return {
                    ...prev,
                    proposedFiles: newFiles,
                  };
                });
              }
              if (data.done) {
                setWorkflowState('preview_ready');
                setStatusNotice('Preview ready — live code generated successfully.');
                setPreviewRenderKey((k) => k + 1);
              }
            } catch {
              // Ignore malformed SSE chunk
            }
          }
        }
      }

      setWorkflowState('preview_ready');
      setStatusNotice('Preview ready — live code generated successfully.');
      setPreviewRenderKey((k) => k + 1);
      addActivity('preview_generated', `Completed streaming for ${currentFile.name}.`);
    } catch (err: any) {
      console.warn('Live code streaming error:', err);
      setWorkflowState('error');
      setStatusNotice('No active AI key found or endpoint error. Go to Settings → AI Providers to connect your key.');
      warning('Live Stream Failed', 'Please connect a valid API key (FreeLLMMap, Gemini, etc.) in Settings.');
      addActivity('preview_generated', `Error: ${err?.message || 'Failed to stream real-time code'}`);
    }
  };

  // Step 3: Copy Code
  const handleCopyCode = async () => {
    if (!activePlan || !activePlan.proposedFiles[activeFileIndex]) return;
    const currentCode = activePlan.proposedFiles[activeFileIndex].code;

    try {
      await navigator.clipboard.writeText(currentCode);
      setCopiedFeedback(true);
      success('Copied to Clipboard', `"${activePlan.proposedFiles[activeFileIndex].name}" copied.`);
      addActivity('code_copied', `Copied "${activePlan.proposedFiles[activeFileIndex].name}" to clipboard.`);
      setTimeout(() => setCopiedFeedback(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Step 4: Download File
  const handleDownloadFile = () => {
    if (!activePlan || !activePlan.proposedFiles[activeFileIndex]) return;
    const file = activePlan.proposedFiles[activeFileIndex];

    const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    success('File Downloaded', `Downloaded "${file.name}"`);
    addActivity('file_downloaded', `Downloaded file: "${file.name}".`);
  };

  // Step 5: Approve Changes
  const handleApproveChanges = () => {
    setWorkflowState('approved');
    setStatusNotice('Approved for export. You can copy or download the validated code.');
    success('Code Approved', 'Code validated and ready for export.');
    addActivity('export_approved', 'User approved proposed changes for manual export.');
  };

  // Step 6: Reject Changes
  const handleRejectChanges = () => {
    setWorkflowState('rejected');
    setStatusNotice('Changes discarded.');
    warning('Plan Discarded', 'Generated implementation plan was reset.');
    addActivity('changes_rejected', 'Proposed code was discarded.');
    setTimeout(() => {
      setWorkflowState('idle');
      setActivePlan(null);
      setActiveViewTab('code');
      setClarificationAnswers({});
      setStatusNotice('Preview only — no project files were changed.');
    }, 1000);
  };

  // Keyboard shortcut: Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCreatePlan();
    }
  };

  const currentProposedFile: ProposedFile | undefined =
    activePlan?.proposedFiles[activeFileIndex];

  // Evaluate UI preview support for the active file
  const uiSupportStatus = isUiPreviewSupported(currentProposedFile);

  // Generate safe sandbox HTML
  let sandboxSrcDoc = '';
  if (currentProposedFile && uiSupportStatus.isSupported) {
    try {
      sandboxSrcDoc = generateSafeSandboxHtml(currentProposedFile);
    } catch {
      if (!previewError) setPreviewError(true);
    }
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5 animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* TOP HEADER CARD                                                           */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                Code Assistant
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200/70">
                Safe MVP
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Plan, generate, review, and export code with your connected AI provider.
            </p>
          </div>
        </div>

        {/* Unified Model Selector Dropdown & Provider Status */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200/90 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs hover:border-amber-400 transition-colors">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-stone-400 font-medium hidden md:inline">Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="bg-transparent font-semibold text-stone-800 text-xs border-none outline-none cursor-pointer pr-1"
              aria-label="Select AI Model"
            >
              <option value="auto">⚡ Auto (Smart Multi-Agent Pilot)</option>
              {modelOptions
                .filter((opt) => opt.id !== 'auto')
                .map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
            </select>
          </div>

          <Link
            href="/settings/ai-providers"
            className="flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/80 rounded-xl px-3 py-1.5 text-xs text-stone-600 hover:text-stone-900 transition-colors shadow-2xs"
            title="Manage API Keys (FreeLLMMap, Gemini, Claude, Groq)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400" />
            <span className="hidden sm:inline">Keys</span>
            {activeConnection ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400 ml-0.5" />
            )}
          </Link>

          {onNavigateToDashboard && (
            <button
              onClick={onNavigateToDashboard}
              className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors cursor-pointer"
            >
              ← Dashboard
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2-COLUMN MAIN LAYOUT (Desktop)                                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ======================================================================= */}
        {/* LEFT COLUMN: Request, Clarifications & Plan (5 cols)                    */}
        {/* ======================================================================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* Describe what you want to build Card */}
          <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Describe what you want to build
                </h2>
              </div>
              <span className="text-[10px] text-stone-400">Ctrl + Enter to run</span>
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5">
              {['Build a component', 'Fix an error', 'Explain code', 'Refactor code', 'Add a feature'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelectSuggestion(cat)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-2xs'
                        : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            {/* Multiline Request Input */}
            <form onSubmit={handleCreatePlan} className="space-y-3">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your coding task, component, bug, or feature in detail..."
                  rows={4}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all resize-none leading-relaxed"
                  disabled={workflowState === 'thinking' || workflowState === 'generating_code'}
                  required
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-stone-400">
                  {requestText.length} characters
                </span>
                <button
                  type="submit"
                  disabled={
                    !requestText.trim() ||
                    workflowState === 'thinking' ||
                    workflowState === 'generating_code'
                  }
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {workflowState === 'thinking' ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Thinking...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Create plan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Clarifying Questions Card (if triggered) */}
          {workflowState === 'needs_clarification' && (
            <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Clarifying Questions</span>
              </div>
              <p className="text-[11.5px] text-amber-800">
                Please answer these architecture questions to customize the generated code:
              </p>

              <div className="space-y-3">
                {MOCK_CODE_TEMPLATES[selectedCategory]?.clarifications?.map((q) => (
                  <div key={q.id} className="space-y-1.5 bg-white p-3 rounded-xl border border-amber-200/60">
                    <p className="text-xs font-semibold text-stone-800">{q.question}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt) => {
                        const isChosen = clarificationAnswers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleAnswerClarification(q.id, opt)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer ${
                              isChosen
                                ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-700'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Implementation Plan Card (when ready or in preview) */}
          {activePlan && (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                    Implementation Plan
                  </h3>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Plan Validated
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                {activePlan.summary}
              </p>

              {/* Steps List */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-bold text-stone-500 uppercase tracking-wider block">
                  Execution Steps
                </span>
                <ul className="space-y-1 text-[11.5px] text-stone-700">
                  {activePlan.steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-amber-600 font-bold">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Affected Files */}
              <div className="space-y-1.5">
                <span className="text-[10.5px] font-bold text-stone-500 uppercase tracking-wider block">
                  Affected Files
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activePlan.affectedFiles.map((file, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded-md font-mono text-[11px] text-stone-700 flex items-center gap-1"
                    >
                      <FileCode className="w-3 h-3 text-stone-500" />
                      {file}
                    </span>
                  ))}
                </div>
              </div>

              {/* Suggested Dependencies & Risks */}
              <div className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl space-y-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-stone-700 font-semibold">
                  <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Dependencies:</span>
                  <span className="font-normal text-stone-600">
                    {activePlan.suggestedDependencies.join(', ')}
                  </span>
                </div>
                <div className="flex items-start gap-1.5 text-stone-600">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>Safety: {activePlan.risksAndNotes[0]}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => textareaRef.current?.focus()}
                  className="text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                >
                  Edit request
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={workflowState === 'generating_code'}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {workflowState === 'generating_code' ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating preview...</span>
                    </>
                  ) : (
                    <>
                      <span>Generate preview</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN: Proposed Code Preview (7 cols)                            */}
        {/* ======================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4 flex flex-col justify-between">
            {/* Header & Tabs */}
            <div className="space-y-3 pb-3 border-b border-stone-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                    <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                      Proposed Code Preview
                    </h2>
                  </div>

                  {/* Compact Tabs: Code / Live Preview */}
                  <div
                    role="tablist"
                    aria-label="Code preview display mode"
                    className="flex items-center p-0.5 bg-stone-100 rounded-lg border border-stone-200/80"
                  >
                    <button
                      type="button"
                      role="tab"
                      id="tab-code"
                      aria-selected={activeViewTab === 'code'}
                      aria-controls="panel-code"
                      tabIndex={activeViewTab === 'code' ? 0 : -1}
                      onClick={() => setActiveViewTab('code')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
                        activeViewTab === 'code'
                          ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/70'
                          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/40'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5 text-amber-600" />
                      <span>Code</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      id="tab-live-preview"
                      aria-selected={activeViewTab === 'preview'}
                      aria-controls="panel-live-preview"
                      tabIndex={activeViewTab === 'preview' ? 0 : -1}
                      onClick={handleSwitchToPreview}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all select-none cursor-pointer ${
                        activeViewTab === 'preview'
                          ? 'bg-white text-stone-900 shadow-2xs border border-stone-200/70'
                          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/40'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5 text-amber-600" />
                      <span>Live Preview</span>
                    </button>
                  </div>
                </div>

                {/* Status Message Badge */}
                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  {workflowState === 'approved' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
                      <CheckCircle2 className="w-3 h-3" /> Approved for export
                    </span>
                  ) : workflowState === 'rejected' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 animate-in fade-in">
                      <XCircle className="w-3 h-3" /> Changes discarded
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70">
                      <ShieldCheck className="w-3 h-3" /> Preview Only
                    </span>
                  )}
                </div>
              </div>

              {/* Multi-File Tabs (if available) */}
              {activePlan && activePlan.proposedFiles.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {activePlan.proposedFiles.map((file, idx) => {
                    const isSelected = activeFileIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setActiveFileIndex(idx);
                          if (activeViewTab === 'preview') {
                            handleReloadPreview();
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                          isSelected
                            ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                            : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5" />
                        <span>{file.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TAB CONTENT PANELS */}

            {/* 1. CODE TAB PANEL */}
            {activeViewTab === 'code' && (
              <div
                role="tabpanel"
                id="panel-code"
                aria-labelledby="tab-code"
                className="relative rounded-xl border border-stone-200 bg-[#1e1e1e] text-stone-100 overflow-hidden shadow-xs"
              >
                {/* Code Top Bar */}
                <div className="flex items-center justify-between px-3 py-2 bg-[#2d2d2d] border-b border-stone-700 text-stone-400 text-xs">
                  <span className="font-mono text-[11px] text-stone-300">
                    {currentProposedFile?.path || 'components/ProposedComponent.tsx'}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-stone-400">
                    {currentProposedFile?.language || 'typescript'}
                  </span>
                </div>

                {/* Code Monospace Box */}
                <div className="p-4 overflow-x-auto font-mono text-[11.5px] leading-relaxed max-h-[460px] min-h-[300px]">
                  {activePlan && currentProposedFile ? (
                    <pre className="text-stone-200 font-mono whitespace-pre selection:bg-amber-500/40">
                      <code>{currentProposedFile.code}</code>
                    </pre>
                  ) : (
                    <div className="h-[300px] flex flex-col items-center justify-center text-center p-6 text-stone-400 space-y-2">
                      <Code2 className="w-8 h-8 text-stone-500 animate-pulse" />
                      <p className="text-xs font-semibold text-stone-300">
                        No code preview generated yet
                      </p>
                      <p className="text-[11px] text-stone-500 max-w-xs">
                        Type your request on the left and click &quot;Create plan&quot; to review the architecture and code proposal.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. LIVE PREVIEW TAB PANEL */}
            {activeViewTab === 'preview' && (
              <div
                role="tabpanel"
                id="panel-live-preview"
                aria-labelledby="tab-live-preview"
                className="relative rounded-xl border border-stone-200 bg-[#fdfbf7] overflow-hidden shadow-xs flex flex-col"
              >
                {/* Live Preview Safe Status & Control Bar */}
                <div className="flex items-center justify-between px-3 py-2 bg-stone-100 border-b border-stone-200 text-stone-600 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-[11px] text-stone-600">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Safe preview — runs in an isolated sandbox</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleReloadPreview}
                    disabled={!activePlan || !uiSupportStatus.isSupported || isPreviewLoading}
                    className="p-1 rounded-md text-stone-500 hover:text-stone-800 hover:bg-stone-200/70 transition-colors disabled:opacity-40 cursor-pointer"
                    aria-label="Reload preview"
                    title="Reload preview"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isPreviewLoading ? 'animate-spin text-amber-600' : ''}`}
                    />
                  </button>
                </div>

                {/* Preview Viewport Container */}
                <div className="relative min-h-[360px] max-h-[460px] h-[440px] w-full flex items-center justify-center overflow-auto bg-stone-50/50">
                  {/* State A: No Plan / No Code */}
                  {!activePlan || !currentProposedFile ? (
                    <div className="flex flex-col items-center justify-center text-center p-6 text-stone-400 space-y-2">
                      <Code2 className="w-8 h-8 text-stone-400 animate-pulse" />
                      <p className="text-xs font-semibold text-stone-600">
                        No code preview generated yet
                      </p>
                      <p className="text-[11px] text-stone-500 max-w-xs">
                        Type your request on the left and click &quot;Create plan&quot; to review the architecture and code proposal.
                      </p>
                    </div>
                  ) : isPreviewLoading ? (
                    /* State B: Loading State */
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex flex-col items-center justify-center text-center p-6 text-stone-600 space-y-2.5 animate-in fade-in"
                    >
                      <RefreshCw className="w-7 h-7 text-amber-500 animate-spin" />
                      <p className="text-xs font-bold text-stone-700">Building preview…</p>
                      <p className="text-[11px] text-stone-400">
                        Rendering in safe isolated sandbox
                      </p>
                    </div>
                  ) : previewError ? (
                    /* State C: Error State */
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="flex flex-col items-center justify-center text-center p-6 max-w-md space-y-3 animate-in fade-in"
                    >
                      <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-stone-800">
                          Preview could not be created. Review the code and try again.
                        </p>
                        <p className="text-[11px] text-stone-500">
                          The generated code syntax could not be rendered inside the sandbox.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleReloadPreview}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Try again
                      </button>
                    </div>
                  ) : !uiSupportStatus.isSupported ? (
                    /* State D: Unsupported Backend/Non-UI Code State */
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex flex-col items-center justify-center text-center p-6 max-w-md space-y-3 animate-in fade-in"
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-stone-800">
                          Backend / Non-UI Module
                        </p>
                        <p className="text-[11.5px] text-stone-600 leading-relaxed">
                          Live preview is available for UI code such as HTML, CSS, React components, and frontend pages.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveViewTab('code')}
                        className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Code2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>View code module</span>
                      </button>
                    </div>
                  ) : (
                    /* State E: Safe Sandboxed Iframe Preview */
                    <iframe
                      key={`preview-frame-${activeFileIndex}-${previewRenderKey}`}
                      title="Code execution safe live preview"
                      sandbox="allow-scripts"
                      srcDoc={sandboxSrcDoc}
                      className="w-full h-full border-0 bg-transparent"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons Bar */}
            <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-[11px] text-stone-500 flex items-center gap-1.5 self-start sm:self-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>No direct filesystem write. Clean export only.</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyCode}
                  disabled={!activePlan}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="Copy code to clipboard"
                >
                  {copiedFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy code</span>
                    </>
                  )}
                </button>

                {/* Download Button */}
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  disabled={!activePlan}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="Download generated code file"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download file</span>
                </button>

                {/* Reject Button */}
                <button
                  type="button"
                  onClick={handleRejectChanges}
                  disabled={!activePlan}
                  className="px-3 py-1.5 bg-stone-50 hover:bg-red-50 text-stone-600 hover:text-red-700 border border-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  aria-label="Reject proposed changes"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                {/* Approve Button */}
                <button
                  type="button"
                  onClick={handleApproveChanges}
                  disabled={!activePlan || workflowState === 'approved'}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  aria-label="Approve changes for export"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{workflowState === 'approved' ? 'Approved' : 'Approve changes'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM SECTION: Activity History                                          */}
      {/* ========================================================================= */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              Activity History
            </h2>
          </div>
          <span className="text-[10px] text-stone-400 font-mono">In-Memory Audit Log</span>
        </div>

        <div className="divide-y divide-stone-100 max-h-40 overflow-y-auto pr-1">
          {activities.map((act) => (
            <div
              key={act.id}
              className="py-2 flex items-center justify-between text-xs hover:bg-stone-50/50 px-1 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10.5px] text-stone-400">[{act.timestamp}]</span>
                <span className="font-medium text-stone-800">{act.message}</span>
              </div>
              <span className="text-[10px] uppercase font-bold text-stone-400">
                {act.type.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
