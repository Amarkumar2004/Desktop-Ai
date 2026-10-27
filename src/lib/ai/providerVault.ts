'use client';

import type {
  AiProviderId,
  ProviderConnectionMetadata,
} from '@/types/aiProviders';
import { AI_PROVIDERS_CATALOG } from '@/data/mockAiProviders';

export const STORAGE_KEY_PROVIDERS = 'susi_ai_provider_connections_v2';
export const STORAGE_KEY_SELECTED_MODEL = 'susi_ai_selected_model_v2';

export interface UnifiedModelOption {
  id: string; // 'auto' or '${providerId}:${modelName}'
  label: string;
  providerId: AiProviderId | 'auto';
  providerName: string;
  modelName: string;
  category?: string;
  badge?: string;
}

/**
 * Returns default initial connections.
 */
export function getDefaultProviderConnections(): ProviderConnectionMetadata[] {
  const geminiConfig = AI_PROVIDERS_CATALOG.find((c) => c.id === 'google_gemini')!;
  const freellmConfig = AI_PROVIDERS_CATALOG.find((c) => c.id === 'freellm')!;

  return [
    {
      id: 'conn_freellm_default',
      workspaceId: 'ws_default_01',
      provider: 'freellm',
      providerLabel: freellmConfig.name,
      displayName: 'FreeLLMMap Multi-Agent Gateway',
      maskedKeySuffix: '••••free',
      baseUrl: freellmConfig.defaultBaseUrl,
      selectedModel: 'deepseek/deepseek-chat',
      availableModels: [...freellmConfig.defaultModels],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: '2026-10-27T00:00:00Z',
    },
    {
      id: 'conn_gemini_default',
      workspaceId: 'ws_default_01',
      provider: 'google_gemini',
      providerLabel: geminiConfig.name,
      displayName: 'Google Gemini Workspace',
      maskedKeySuffix: '••••live',
      selectedModel: 'gemini-2.0-flash',
      availableModels: [...geminiConfig.defaultModels],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: '2026-10-27T00:00:00Z',
    },
  ];
}

/**
 * Loads stored connections from client localStorage.
 */
export function getStoredProviderConnections(): ProviderConnectionMetadata[] {
  if (typeof window === 'undefined') return getDefaultProviderConnections();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS);
    if (!raw) {
      const defaults = getDefaultProviderConnections();
      localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return getDefaultProviderConnections();
  } catch {
    return getDefaultProviderConnections();
  }
}

/**
 * Saves connections to client localStorage and notifies listeners.
 */
export function saveStoredProviderConnections(connections: ProviderConnectionMetadata[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(connections));
    window.dispatchEvent(
      new CustomEvent('susi-providers-updated', { detail: { connections } })
    );
  } catch (err) {
    console.error('Failed to save provider connections', err);
  }
}

/**
 * Saves and retrieves the currently selected global AI model.
 */
export function getStoredSelectedModel(): string {
  if (typeof window === 'undefined') return 'auto';
  try {
    return localStorage.getItem(STORAGE_KEY_SELECTED_MODEL) || 'auto';
  } catch {
    return 'auto';
  }
}

export function saveStoredSelectedModel(modelId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED_MODEL, modelId);
    window.dispatchEvent(
      new CustomEvent('susi-model-selected', { detail: { modelId } })
    );
  } catch (err) {
    console.error('Failed to save selected model', err);
  }
}

/**
 * Derives the unified list of selectable models across all connected providers.
 */
export function getUnifiedModelsList(
  connections: ProviderConnectionMetadata[] = getStoredProviderConnections()
): UnifiedModelOption[] {
  const options: UnifiedModelOption[] = [
    {
      id: 'auto',
      label: '⚡ Auto (Smart Multi-Agent Pilot)',
      providerId: 'auto',
      providerName: 'SUSI Smart Router',
      modelName: 'auto',
      badge: 'Auto-Pilot',
    },
  ];

  const connected = connections.filter((c) => c.status === 'connected');

  for (const conn of connected) {
    const providerConfig = AI_PROVIDERS_CATALOG.find((p) => p.id === conn.provider);
    const providerName = conn.displayName || providerConfig?.name || conn.providerLabel;
    const models = conn.availableModels.length > 0
      ? conn.availableModels
      : (providerConfig?.defaultModels || ['default-model']);

    for (const model of models) {
      options.push({
        id: `${conn.provider}:${model}`,
        label: `${model} (${providerName})`,
        providerId: conn.provider,
        providerName,
        modelName: model,
        category: providerConfig?.category,
      });
    }
  }

  return options;
}

/**
 * Packages active credentials payload to send with stream requests.
 */
export function packageActiveProvidersPayload(
  connections: ProviderConnectionMetadata[] = getStoredProviderConnections()
): Record<string, { apiKey?: string; baseUrl?: string; selectedModel?: string }> {
  const payload: Record<string, { apiKey?: string; baseUrl?: string; selectedModel?: string }> = {};

  for (const c of connections) {
    if (c.status === 'connected') {
      payload[c.provider] = {
        apiKey: c.rawKey || undefined,
        baseUrl: c.baseUrl || undefined,
        selectedModel: c.selectedModel || undefined,
      };
    }
  }

  return payload;
}
