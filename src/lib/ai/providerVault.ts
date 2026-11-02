'use client';

import type {
  AiProviderId,
  ProviderConnectionMetadata,
} from '@/types/aiProviders';
import { AI_PROVIDERS_CATALOG } from '@/data/mockAiProviders';

export const STORAGE_KEY_PROVIDERS = 'susi_ai_provider_connections_v2';
export const STORAGE_KEY_SELECTED_MODEL = 'susi_ai_selected_model_v2';
const CREDENTIAL_SERVICE = 'susi-ai';

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
 * By default empty: user must explicitly add their key in Settings to show connected.
 */
export function getDefaultProviderConnections(): ProviderConnectionMetadata[] {
  return [];
}

// In-memory volatile secret vault (never written to persistent browser localStorage)
const memorySecretVault = new Map<string, string>();

/**
 * Persists an API credential encrypted at rest via Windows Credential Manager (DPAPI) when running in Tauri.
 * Matches Rust Tauri command signature: save_credential_secure(service, user, secret)
 */
export async function persistCredentialSecure(key: string, secret: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const tauri = (window as any).__TAURI__;
    if (tauri?.invoke) {
      const res = await tauri.invoke('save_credential_secure', {
        service: CREDENTIAL_SERVICE,
        user: key,
        key: key,
        secret,
      });
      return Boolean(res);
    }
  } catch (err) {
    console.error('[ProviderVault] Failed to save credential in Windows Credential Manager:', err);
    throw err;
  }
  // Browser mode has no secure persistent credential store. Never report success:
  // saveStoredProviderConnections must keep the secret out of localStorage and fail closed.
  return false;
}

/**
 * Retrieves an encrypted credential from Windows Credential Manager when running in Tauri.
 * Matches Rust Tauri command signature: get_credential_secure(service, user)
 */
export async function retrieveCredentialSecure(key: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const tauri = (window as any).__TAURI__;
    if (tauri?.invoke) {
      const res = await tauri.invoke('get_credential_secure', {
        service: CREDENTIAL_SERVICE,
        user: key,
        key: key,
      });
      return typeof res === 'string' && res.length > 0 ? res : null;
    }
  } catch (err) {
    console.warn('[ProviderVault] Could not load credential from Windows Credential Manager:', err);
  }
  return null;
}

/**
 * Deletes a stored credential from Windows Credential Manager when running in Tauri.
 * Matches Rust Tauri command signature: delete_credential_secure(service, user)
 */
export async function deleteCredentialSecure(key: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const tauri = (window as any).__TAURI__;
    if (tauri?.invoke) {
      const res = await tauri.invoke('delete_credential_secure', {
        service: CREDENTIAL_SERVICE,
        user: key,
        key: key,
      });
      return Boolean(res);
    }
  } catch (err) {
    console.warn('[ProviderVault] Could not delete credential from Windows Credential Manager:', err);
  }
  // No native credential store is available in a regular browser session.
  return false;
}

/**
 * Rehydrates in-memory secrets from Windows Credential Manager upon desktop app startup.
 */
export async function hydrateSecureCredentials(): Promise<ProviderConnectionMetadata[]> {
  if (typeof window === 'undefined') return [];
  const stored = getStoredProviderConnections();
  let updatedAny = false;

  for (const conn of stored) {
    if (!conn.rawKey) {
      const secret = await retrieveCredentialSecure(conn.id);
      if (secret) {
        memorySecretVault.set(conn.id, secret);
        conn.rawKey = secret;
        updatedAny = true;
      }
    }
  }

  if (updatedAny && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('susi-providers-updated', { detail: { connections: stored } })
    );
  }

  return stored;
}

/**
 * Loads stored connections from client localStorage and merges with in-memory secrets.
 */
export function getStoredProviderConnections(): ProviderConnectionMetadata[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDERS);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item: ProviderConnectionMetadata) => ({
        ...item,
        // Re-attach in-memory secret if available for current session
        rawKey: memorySecretVault.get(item.id) || undefined,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Saves connections to client localStorage with rawKey SCRUBBED for security,
 * and securely persists keys to Windows Credential Manager (DPAPI).
 */
export async function saveStoredProviderConnections(
  connections: ProviderConnectionMetadata[]
): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  try {
    // 1. Persist credentials securely
    for (const conn of connections) {
      if (conn.rawKey) {
        memorySecretVault.set(conn.id, conn.rawKey);
        try {
          const persisted = await persistCredentialSecure(conn.id, conn.rawKey);
          if (!persisted) {
            throw new Error('Secure credential storage is unavailable in this environment.');
          }
        } catch (credErr) {
          console.error(`Failed to persist credential for provider "${conn.providerLabel}":`, credErr);
          throw new Error(`Credential Manager persistence failed for "${conn.providerLabel}"`);
        }
      } else if (conn.status === 'not_connected') {
        memorySecretVault.delete(conn.id);
        await deleteCredentialSecure(conn.id);
      }
    }

    // 2. Scrub rawKey before saving to persistent localStorage
    const scrubbed = connections.map((conn) => {
      const copy = { ...conn };
      delete copy.rawKey;
      return copy;
    });

    localStorage.setItem(STORAGE_KEY_PROVIDERS, JSON.stringify(scrubbed));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('susi-providers-updated', { detail: { connections } })
      );
    }
    return true;
  } catch (err) {
    console.error('Failed to save provider connections:', err);
    throw err;
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
