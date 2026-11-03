'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  ShieldCheck,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Mic,
  MessageSquare,
  Code2,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Server,
  Zap,
  Globe,
  SlidersHorizontal,
  X,
  Check,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import {
  AI_PROVIDERS_CATALOG,
  INITIAL_MOCK_CONNECTIONS,
} from '@/data/mockAiProviders';
import type {
  AiProviderId,
  ProviderConnectionMetadata,
} from '@/types/aiProviders';
import {
  getStoredProviderConnections,
  saveStoredProviderConnections,
} from '@/lib/ai/providerVault';

/** Read the SSE test response and only accept a real model token as proof of connectivity. */
async function readProviderTestResult(response: Response): Promise<{ ok: boolean; error?: string }> {
  const body = await response.text();
  if (!response.ok) return { ok: false, error: `HTTP ${response.status}: ${body.slice(0, 180)}` };
  let receivedToken = false;
  let providerError = '';
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const event = JSON.parse(line.slice(5).trim());
      if (typeof event.token === 'string' && event.token.trim()) receivedToken = true;
      if (typeof event.error === 'string') providerError = event.error;
    } catch { /* Ignore non-JSON SSE lines. */ }
  }
  if (providerError) return { ok: false, error: providerError };
  return receivedToken ? { ok: true } : { ok: false, error: 'Provider returned no model output. Check the API key and model.' };
}

export default function AiProvidersPage() {
  const [connections, setConnections] = useState<ProviderConnectionMetadata[]>(
    INITIAL_MOCK_CONNECTIONS
  );

  useEffect(() => {
    setConnections(getStoredProviderConnections());
    const handleUpdate = () => {
      setConnections(getStoredProviderConnections());
    };
    window.addEventListener('susi-providers-updated', handleUpdate);
    return () => window.removeEventListener('susi-providers-updated', handleUpdate);
  }, []);

  // Add Provider Flow State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<1 | 2>(1); // Step 1: Select Provider, Step 2: Connection Form
  const [selectedProviderId, setSelectedProviderId] = useState<AiProviderId>('google_gemini');
  const [displayName, setDisplayName] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [selectedModelInput, setSelectedModelInput] = useState('');
  const [formCapabilities, setFormCapabilities] = useState({
    voice: true,
    chat: true,
    code: true,
  });
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingInModal, setIsTestingInModal] = useState(false);
  const [modalTestSuccess, setModalTestSuccess] = useState(false);

  // Configure Capabilities Modal State
  const [editingConn, setEditingConn] = useState<ProviderConnectionMetadata | null>(null);

  // Disconnect Confirmation Modal State
  const [disconnectTarget, setDisconnectTarget] = useState<ProviderConnectionMetadata | null>(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Card Test Connection Feedback State
  const [testingCardId, setTestingCardId] = useState<string | null>(null);

  const selectedProviderConfig =
    AI_PROVIDERS_CATALOG.find((p) => p.id === selectedProviderId) || AI_PROVIDERS_CATALOG[0];

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  // Open Step 1: Provider Selection
  const handleOpenAddFlow = () => {
    setSelectedProviderId('google_gemini');
    setDisplayName('');
    setApiKeyInput('');
    setShowApiKey(false);
    setBaseUrlInput('');
    setSelectedModelInput('gemini-2.0-flash');
    setFormCapabilities({ voice: true, chat: true, code: true });
    setFormError('');
    setModalTestSuccess(false);
    setModalStep(1);
    setIsAddModalOpen(true);
  };

  // Close Add Flow and wipe sensitive input immediately
  const handleCloseAddFlow = () => {
    setApiKeyInput(''); // Instant wipe
    setShowApiKey(false);
    setFormError('');
    setModalTestSuccess(false);
    setIsAddModalOpen(false);
  };

  // Select Provider & Proceed to Step 2
  const handleSelectProvider = (pId: AiProviderId) => {
    const cfg = AI_PROVIDERS_CATALOG.find((p) => p.id === pId) || AI_PROVIDERS_CATALOG[0];
    setSelectedProviderId(pId);
    setDisplayName('');
    setApiKeyInput('');
    setShowApiKey(false);
    setBaseUrlInput(cfg.defaultBaseUrl || '');
    setSelectedModelInput(cfg.defaultModels[0] || 'default-model');
    setFormCapabilities({ voice: true, chat: true, code: true });
    setFormError('');
    setModalTestSuccess(false);
    setModalStep(2);
  };

  // In-Modal Test Connection via /api/ai/stream
  const handleModalTest = async () => {
    if (!apiKeyInput.trim()) {
      setFormError(`Please enter your ${selectedProviderConfig.keyLabel} to test.`);
      return;
    }
    setFormError('');
    setIsTestingInModal(true);
    setModalTestSuccess(false);

    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'ping',
          mode: 'chat',
          selectedModel: `${selectedProviderId}:${selectedModelInput || selectedProviderConfig.defaultModels[0]}`,
          userProviders: {
            [selectedProviderId]: {
              apiKey: apiKeyInput.trim(),
              baseUrl: baseUrlInput.trim() || undefined,
              selectedModel: selectedModelInput || undefined,
            },
          },
        }),
      });

      const verification = await readProviderTestResult(res);
      if (verification.ok) {
        setModalTestSuccess(true);
      } else {
        setFormError(`Connection verification failed: ${verification.error || 'No valid model response'}`);
      }
    } catch (err: any) {
      setFormError(`Connection error: ${err?.message || 'Failed to ping endpoint'}`);
    } finally {
      setIsTestingInModal(false);
    }
  };

  // Step 3: Save Connection
  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!modalTestSuccess) {
      setFormError('Verify this provider successfully before saving the connection.');
      return;
    }

    if (!apiKeyInput.trim()) {
      setFormError(`Please enter a valid ${selectedProviderConfig.keyLabel}.`);
      return;
    }

    if (selectedProviderConfig.requiresBaseUrl && !baseUrlInput.trim()) {
      setFormError('Base URL is required for custom OpenAI-compatible endpoints.');
      return;
    }

    setIsSaving(true);

    const rawTrimmed = apiKeyInput.trim();
    const last4 = rawTrimmed.length >= 4 ? rawTrimmed.slice(-4) : '8921';
    const maskedSuffix = `••••${last4}`;

    setTimeout(() => {
      const newConn: ProviderConnectionMetadata = {
        id: `conn_${selectedProviderId}_${Date.now()}`,
        workspaceId: 'ws_default_01',
        provider: selectedProviderId,
        providerLabel: selectedProviderConfig.name,
        displayName: displayName.trim() || selectedProviderConfig.name,
        maskedKeySuffix: maskedSuffix,
        rawKey: rawTrimmed,
        baseUrl: baseUrlInput.trim() || undefined,
        selectedModel: selectedModelInput || selectedProviderConfig.defaultModels[0] || 'default-model',
        availableModels: selectedProviderConfig.defaultModels,
        status: 'connected',
        capabilities: { ...formCapabilities },
        createdAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
      };

      setConnections((prev) => {
        const filtered = prev.filter((c) => c.provider !== selectedProviderId);
        const updated = [...filtered, newConn];
        saveStoredProviderConnections(updated);
        return updated;
      });

      // Clear key input immediately from memory
      setApiKeyInput('');
      setShowApiKey(false);
      setIsSaving(false);
      setIsAddModalOpen(false);

      triggerToast(`${selectedProviderConfig.name} connected successfully.`);
    }, 400);
  };

  // Test Connection from Connected Provider Row
  const handleTestCardConnection = async (conn: ProviderConnectionMetadata) => {
    setTestingCardId(conn.id);
    try {
      const res = await fetch('/api/ai/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'ping',
          mode: 'chat',
          selectedModel: `${conn.provider}:${conn.selectedModel}`,
          userProviders: {
            [conn.provider]: {
              apiKey: conn.rawKey || undefined,
              baseUrl: conn.baseUrl || undefined,
              selectedModel: conn.selectedModel,
            },
          },
        }),
      });

      const verification = await readProviderTestResult(res);
      if (verification.ok) {
        triggerToast(`Connection to ${conn.providerLabel} verified.`);
      } else {
        triggerToast(`Verification failed for ${conn.providerLabel}: ${verification.error || 'No model response'}`);
      }
    } catch (err) {
      triggerToast(`Could not verify ${conn.providerLabel}: ${err instanceof Error ? err.message : 'Network error'}`);
    } finally {
      setTestingCardId(null);
    }
  };

  // Toggle Capability on Connected Provider Row
  const handleToggleCapability = (
    connId: string,
    cap: 'voice' | 'chat' | 'code'
  ) => {
    setConnections((prev) => {
      const updated = prev.map((conn) => {
        if (conn.id !== connId) return conn;
        return {
          ...conn,
          capabilities: {
            ...conn.capabilities,
            [cap]: !conn.capabilities[cap],
          },
        };
      });
      saveStoredProviderConnections(updated);
      return updated;
    });
  };

  // Save Configured Capabilities from Edit Modal
  const handleSaveEditedConn = () => {
    if (!editingConn) return;
    setConnections((prev) => {
      const updated = prev.map((c) => (c.id === editingConn.id ? editingConn : c));
      saveStoredProviderConnections(updated);
      return updated;
    });
    setEditingConn(null);
    triggerToast('Provider configuration updated.');
  };

  // Confirm Disconnect
  const handleConfirmDisconnect = () => {
    if (!disconnectTarget) return;
    const name = disconnectTarget.providerLabel;
    setConnections((prev) => {
      const updated = prev.filter((c) => c.id !== disconnectTarget.id);
      saveStoredProviderConnections(updated);
      return updated;
    });
    setDisconnectTarget(null);
    triggerToast(`${name} disconnected.`);
  };

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] text-stone-800 flex flex-col font-sans antialiased selection:bg-amber-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-stone-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/80 px-4 sm:px-8 py-3.5 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors py-1 px-2 rounded-lg hover:bg-stone-100"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dashboard</span>
            </Link>
            <div className="h-4 w-px bg-stone-200 hidden sm:block" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                <KeyRound className="w-4 h-4" />
              </div>
              <span className="font-bold text-stone-900 text-sm tracking-tight">
                AI Providers & API Keys
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/settings"
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors"
            >
              Settings
            </Link>
            {connections.length > 0 && (
              <button
                onClick={handleOpenAddFlow}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Provider</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Title & Subtitle */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            AI Providers & API Keys
          </h1>
          <p className="text-xs sm:text-sm text-stone-500">
            Connect your own AI provider to power voice, chat, and coding assistance.
          </p>
        </div>

        {/* Concise Security Notice */}
        <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-center gap-3 text-xs text-amber-900 shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[11.5px] leading-relaxed">
            API keys will be encrypted and used only through authenticated server-side provider proxies
            when secure connections are enabled.
          </p>
        </div>

        {/* MAIN VIEW: Connected Providers List OR Clean Empty State */}
        {connections.length === 0 ? (
          /* ========================================================================= */
          /* EMPTY STATE CARD (When no providers are connected)                        */
          /* ========================================================================= */
          <div className="bg-white border border-stone-200/80 rounded-2xl p-8 sm:p-12 text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto font-bold shadow-xs">
              <KeyRound className="w-6 h-6 text-amber-600" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h2 className="text-base sm:text-lg font-bold text-stone-900">
                No AI providers connected
              </h2>
              <p className="text-xs text-stone-500 leading-relaxed">
                Connect your own provider to power voice, chat, and coding assistance.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenAddFlow}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Provider</span>
              </button>
            </div>

            <p className="text-[11px] text-stone-400">
              Your API key is never shown after saving.
            </p>
          </div>
        ) : (
          /* ========================================================================= */
          /* CONNECTED PROVIDERS SECTION (Compact Rows)                                 */
          /* ========================================================================= */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                Connected Providers ({connections.length})
              </h2>
              <button
                type="button"
                onClick={handleOpenAddFlow}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another provider</span>
              </button>
            </div>

            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="bg-white border border-stone-200/80 rounded-2xl p-4 sm:p-5 shadow-2xs hover:border-amber-200 transition-all space-y-3"
                >
                  {/* Top Line: Icon, Name, Status, Masked Key */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 font-bold">
                        {conn.provider === 'google_gemini' && <Sparkles className="w-4 h-4 text-amber-600" />}
                        {conn.provider === 'openai' && <Zap className="w-4 h-4 text-emerald-600" />}
                        {conn.provider === 'anthropic' && <SlidersHorizontal className="w-4 h-4 text-purple-600" />}
                        {conn.provider === 'groq' && <Zap className="w-4 h-4 text-orange-600" />}
                        {conn.provider === 'openrouter' && <Globe className="w-4 h-4 text-blue-600" />}
                        {conn.provider === 'vertex_ai' && <Server className="w-4 h-4 text-blue-700" />}
                        {conn.provider === 'huggingface' && <Sparkles className="w-4 h-4 text-yellow-600" />}
                        {conn.provider === 'custom_openai' && <Server className="w-4 h-4 text-stone-700" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-stone-900 text-sm">
                            {conn.displayName || conn.providerLabel}
                          </h3>
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Connected
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone-500 mt-0.5">
                          <span className="font-mono font-semibold text-stone-700">
                            Key ending in {conn.maskedKeySuffix}
                          </span>
                          <span>•</span>
                          <span className="font-mono text-stone-600">
                            Model: {conn.selectedModel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions: Configure, Test, Disconnect */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingConn({ ...conn })}
                        className="px-2.5 py-1 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="Configure Model & Capabilities"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Configure</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTestCardConnection(conn)}
                        disabled={testingCardId === conn.id}
                        className="px-2.5 py-1 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                        title="Test Connection"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            testingCardId === conn.id ? 'animate-spin text-amber-600' : ''
                          }`}
                        />
                        <span>{testingCardId === conn.id ? 'Testing...' : 'Test'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDisconnectTarget(conn)}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Disconnect Provider"
                        aria-label={`Disconnect ${conn.providerLabel}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Capabilities Chips */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100 text-xs">
                    <span className="text-[10.5px] font-bold text-stone-400 uppercase tracking-wider">
                      Capabilities:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleCapability(conn.id, 'voice')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        conn.capabilities.voice
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-stone-100 text-stone-400 border border-stone-200'
                      }`}
                    >
                      <Mic className="w-3 h-3" /> Voice
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCapability(conn.id, 'chat')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        conn.capabilities.chat
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-stone-100 text-stone-400 border border-stone-200'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" /> Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleCapability(conn.id, 'code')}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        conn.capabilities.code
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-stone-100 text-stone-400 border border-stone-200'
                      }`}
                    >
                      <Code2 className="w-3 h-3" /> Code
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ============================================================================== */}
      {/* 2-STEP ADD PROVIDER FLOW MODAL                                                 */}
      {/* ============================================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-stone-200 shadow-2xl p-5 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  {modalStep === 1 ? 'Choose an AI provider' : `Connect ${selectedProviderConfig.name}`}
                </h3>
                <p className="text-[11px] text-stone-500">
                  {modalStep === 1
                    ? 'Select the provider whose API key you want to connect.'
                    : 'Enter your credentials and select active capabilities.'}
                </p>
              </div>
              <button
                onClick={handleCloseAddFlow}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* STEP 1: Provider Selection List */}
            {modalStep === 1 ? (
              <div className="space-y-3">
                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {AI_PROVIDERS_CATALOG.map((p) => {
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProvider(p.id)}
                        className="p-3.5 rounded-xl border border-stone-200/80 hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200/60 flex items-center justify-center font-bold text-stone-700 group-hover:bg-amber-100 group-hover:text-amber-800 transition-colors shrink-0">
                            {p.id === 'google_gemini' && <Sparkles className="w-4 h-4 text-amber-600" />}
                            {p.id === 'openai' && <Zap className="w-4 h-4 text-emerald-600" />}
                            {p.id === 'anthropic' && <SlidersHorizontal className="w-4 h-4 text-purple-600" />}
                            {p.id === 'groq' && <Zap className="w-4 h-4 text-orange-600" />}
                            {p.id === 'openrouter' && <Globe className="w-4 h-4 text-blue-600" />}
                            {p.id === 'vertex_ai' && <Server className="w-4 h-4 text-blue-700" />}
                            {p.id === 'huggingface' && <Sparkles className="w-4 h-4 text-yellow-600" />}
                            {p.id === 'custom_openai' && <Server className="w-4 h-4 text-stone-700" />}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-stone-900 group-hover:text-amber-900">
                              {p.name}
                            </div>
                            <p className="text-[11px] text-stone-500 leading-snug mt-0.5">
                              {p.description}
                            </p>
                          </div>
                        </div>

                        <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={handleCloseAddFlow}
                    className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* STEP 2: Provider Connection Form */
              <form onSubmit={handleSaveConnection} className="space-y-4" noValidate>
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {modalTestSuccess && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Key format verified successfully.</span>
                  </div>
                )}

                {/* Connection Label (Optional) */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Connection Name <span className="text-stone-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder={`e.g. My ${selectedProviderConfig.name}`}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                  />
                </div>

                {/* Base URL (Only for Custom OpenAI-Compatible) */}
                {selectedProviderConfig.requiresBaseUrl && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-stone-700 block">
                      Base URL <span className="text-amber-600">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="http://localhost:11434/v1"
                      value={baseUrlInput}
                      onChange={(e) => setBaseUrlInput(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-800 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-mono"
                      required
                    />
                    <p className="text-[10px] text-stone-400">
                      Endpoint for your self-hosted Ollama, vLLM, or LM Studio proxy.
                    </p>
                  </div>
                )}

                {/* Provider-Specific API Key Input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    {selectedProviderConfig.keyLabel} <span className="text-amber-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder={selectedProviderConfig.placeholderKeyFormat}
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setModalTestSuccess(false);
                      }}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-3 pr-10 py-2 text-xs font-mono text-stone-800 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                      autoComplete="off"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1"
                      aria-label={showApiKey ? 'Hide key' : 'Show key'}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10.5px] text-stone-500">
                    {selectedProviderConfig.keyHint}
                  </p>
                </div>

                {/* Model Selector */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-700 block">
                    Model
                  </label>
                  <select
                    value={selectedModelInput}
                    onChange={(e) => setSelectedModelInput(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden"
                  >
                    {selectedProviderConfig.defaultModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Capability Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-700 block">
                    Assigned Capabilities
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-stone-700 p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50 select-none">
                      <input
                        type="checkbox"
                        checked={formCapabilities.voice}
                        onChange={(e) =>
                          setFormCapabilities((prev) => ({ ...prev, voice: e.target.checked }))
                        }
                        className="rounded text-amber-500 accent-amber-500"
                      />
                      <span>Voice</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-stone-700 p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50 select-none">
                      <input
                        type="checkbox"
                        checked={formCapabilities.chat}
                        onChange={(e) =>
                          setFormCapabilities((prev) => ({ ...prev, chat: e.target.checked }))
                        }
                        className="rounded text-amber-500 accent-amber-500"
                      />
                      <span>Chat</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-stone-700 p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50 select-none">
                      <input
                        type="checkbox"
                        checked={formCapabilities.code}
                        onChange={(e) =>
                          setFormCapabilities((prev) => ({ ...prev, code: e.target.checked }))
                        }
                        className="rounded text-amber-500 accent-amber-500"
                      />
                      <span>Code</span>
                    </label>
                  </div>
                </div>

                {/* Buttons: Test, Back, Cancel, Save */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={handleModalTest}
                    disabled={isTestingInModal || !apiKeyInput}
                    className="px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingInModal ? 'animate-spin text-amber-600' : ''}`} />
                    <span>{isTestingInModal ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalStep(1)}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseAddFlow}
                      disabled={isSaving}
                      className="px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>{isSaving ? 'Saving...' : 'Save Connection'}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* CONFIGURE / EDIT CAPABILITIES MODAL                                            */}
      {/* ============================================================================== */}
      {editingConn && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">Configure {editingConn.providerLabel}</h3>
              <button
                onClick={() => setEditingConn(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Model Selection */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-700 block">Active Model</label>
              <select
                value={editingConn.selectedModel}
                onChange={(e) =>
                  setEditingConn((prev) => (prev ? { ...prev, selectedModel: e.target.value } : null))
                }
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-800 outline-hidden"
              >
                {editingConn.availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Capabilities */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700 block">Assigned Capabilities</label>
              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-1.5 text-xs p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                  <input
                    type="checkbox"
                    checked={editingConn.capabilities.voice}
                    onChange={(e) =>
                      setEditingConn((prev) =>
                        prev
                          ? { ...prev, capabilities: { ...prev.capabilities, voice: e.target.checked } }
                          : null
                      )
                    }
                    className="rounded text-amber-500 accent-amber-500"
                  />
                  <span>Voice</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                  <input
                    type="checkbox"
                    checked={editingConn.capabilities.chat}
                    onChange={(e) =>
                      setEditingConn((prev) =>
                        prev
                          ? { ...prev, capabilities: { ...prev.capabilities, chat: e.target.checked } }
                          : null
                      )
                    }
                    className="rounded text-amber-500 accent-amber-500"
                  />
                  <span>Chat</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs p-2 border border-stone-200 rounded-xl cursor-pointer hover:bg-stone-50">
                  <input
                    type="checkbox"
                    checked={editingConn.capabilities.code}
                    onChange={(e) =>
                      setEditingConn((prev) =>
                        prev
                          ? { ...prev, capabilities: { ...prev.capabilities, code: e.target.checked } }
                          : null
                      )
                    }
                    className="rounded text-amber-500 accent-amber-500"
                  />
                  <span>Code</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setEditingConn(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditedConn}
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* DISCONNECT CONFIRMATION MODAL                                                  */}
      {/* ============================================================================== */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">Disconnect Provider?</h3>
                <p className="text-[11px] text-stone-500">{disconnectTarget.providerLabel}</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              Are you sure you want to disconnect{' '}
              <strong className="text-stone-900">{disconnectTarget.displayName || disconnectTarget.providerLabel}</strong>{' '}
              (Key ending in {disconnectTarget.maskedKeySuffix})?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
