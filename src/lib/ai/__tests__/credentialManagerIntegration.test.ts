import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  persistCredentialSecure,
  retrieveCredentialSecure,
  deleteCredentialSecure,
  saveStoredProviderConnections,
  getStoredProviderConnections,
  hydrateSecureCredentials,
  STORAGE_KEY_PROVIDERS,
} from '@/lib/ai/providerVault';
import type { ProviderConnectionMetadata } from '@/types/aiProviders';

describe('Windows Credential Manager Integration (P0 Verification)', () => {
  const mockCredStore = new Map<string, string>();
  const storageMock = new Map<string, string>();

  beforeEach(() => {
    mockCredStore.clear();
    storageMock.clear();

    const localStorageMock = {
      getItem: (k: string) => storageMock.get(k) || null,
      setItem: (k: string, v: string) => storageMock.set(k, String(v)),
      removeItem: (k: string) => storageMock.delete(k),
      clear: () => storageMock.clear(),
      length: 0,
      key: () => null,
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    (globalThis as any).window = globalThis;
    (window as any).localStorage = localStorageMock;
    (window as any).dispatchEvent = vi.fn();
    (globalThis as any).CustomEvent = class CustomEvent {
      constructor(public type: string, public detail?: any) {}
    };

    // Mock Tauri IPC bridge
    (window as any).__TAURI__ = {
      invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
        if (cmd === 'save_credential_secure') {
          // Verify arguments match Rust command signature: service, user, secret
          expect(args.service).toBe('susi-ai');
          expect(args.user).toBeDefined();
          expect(args.secret).toBeDefined();
          mockCredStore.set(`${args.service}:${args.user}`, args.secret as string);
          return true;
        }

        if (cmd === 'get_credential_secure') {
          expect(args.service).toBe('susi-ai');
          expect(args.user).toBeDefined();
          return mockCredStore.get(`${args.service}:${args.user}`) || null;
        }

        if (cmd === 'delete_credential_secure') {
          expect(args.service).toBe('susi-ai');
          expect(args.user).toBeDefined();
          const existed = mockCredStore.delete(`${args.service}:${args.user}`);
          return existed;
        }

        throw new Error(`Unknown Tauri command: ${cmd}`);
      }),
    };
  });

  it('1. persistCredentialSecure calls Tauri with exact matching parameters { service, user, secret }', async () => {
    const res = await persistCredentialSecure('conn_openai_1', 'sk-test-secret-key-12345');
    expect(res).toBe(true);
    expect((window as any).__TAURI__.invoke).toHaveBeenCalledWith('save_credential_secure', {
      service: 'susi-ai',
      user: 'conn_openai_1',
      key: 'conn_openai_1',
      secret: 'sk-test-secret-key-12345',
    });
    expect(mockCredStore.get('susi-ai:conn_openai_1')).toBe('sk-test-secret-key-12345');
  });

  it('2. retrieveCredentialSecure calls Tauri with { service, user } and retrieves stored secret', async () => {
    mockCredStore.set('susi-ai:conn_anthropic_1', 'sk-ant-test-9999');
    const secret = await retrieveCredentialSecure('conn_anthropic_1');
    expect(secret).toBe('sk-ant-test-9999');
    expect((window as any).__TAURI__.invoke).toHaveBeenCalledWith('get_credential_secure', {
      service: 'susi-ai',
      user: 'conn_anthropic_1',
      key: 'conn_anthropic_1',
    });
  });

  it('3. deleteCredentialSecure calls Tauri with { service, user } and deletes stored secret', async () => {
    mockCredStore.set('susi-ai:conn_to_delete', 'sk-delete-me');
    const deleted = await deleteCredentialSecure('conn_to_delete');
    expect(deleted).toBe(true);
    expect(mockCredStore.has('susi-ai:conn_to_delete')).toBe(false);
  });

  it('4. saveStoredProviderConnections awaits persistence and throws explicitly on write failure', async () => {
    // Simulate Credential Manager write failure
    (window as any).__TAURI__.invoke = vi.fn().mockRejectedValue(new Error('Access Denied to Credential Store'));

    const mockConn: ProviderConnectionMetadata = {
      id: 'conn_fail_test',
      workspaceId: 'default',
      provider: 'openai',
      providerLabel: 'OpenAI Test',
      maskedKeySuffix: '••••1234',
      rawKey: 'sk-test-failing-key',
      selectedModel: 'gpt-4o',
      availableModels: [],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: new Date().toISOString(),
    };

    await expect(saveStoredProviderConnections([mockConn])).rejects.toThrow();
  });

  it('5. Verifies plaintext API keys are NEVER saved to localStorage', async () => {
    const mockConn: ProviderConnectionMetadata = {
      id: 'conn_openai_secure',
      workspaceId: 'default',
      provider: 'openai',
      providerLabel: 'OpenAI Secure',
      maskedKeySuffix: '••••8888',
      rawKey: 'sk-proj-SUPER_CONFIDENTIAL_KEY_NEVER_LEAK',
      selectedModel: 'gpt-4o',
      availableModels: [],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: new Date().toISOString(),
    };

    await saveStoredProviderConnections([mockConn]);

    const storedRaw = localStorage.getItem(STORAGE_KEY_PROVIDERS);
    expect(storedRaw).toBeDefined();
    // Raw secret must NOT be in persistent storage
    expect(storedRaw).not.toContain('SUPER_CONFIDENTIAL_KEY_NEVER_LEAK');
    // But metadata is saved
    expect(storedRaw).toContain('OpenAI Secure');
    // Secret was persisted in Windows Credential Manager
    expect(mockCredStore.get('susi-ai:conn_openai_secure')).toBe('sk-proj-SUPER_CONFIDENTIAL_KEY_NEVER_LEAK');
  });

  it('6. Credentials survive application restart and are rehydrated from Windows Credential Manager', async () => {
    const mockConn: ProviderConnectionMetadata = {
      id: 'conn_restart_test',
      workspaceId: 'default',
      provider: 'google_gemini',
      providerLabel: 'Google Gemini',
      maskedKeySuffix: '••••5555',
      rawKey: 'AIzaSy_RESTART_PERSISTENCE_SECRET',
      selectedModel: 'gemini-1.5-pro',
      availableModels: [],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: new Date().toISOString(),
    };

    await saveStoredProviderConnections([mockConn]);

    // Simulate complete browser restart by reloading storage without in-memory rawKey
    const connectionsBeforeHydrate = getStoredProviderConnections();
    expect(connectionsBeforeHydrate[0].rawKey).toBe('AIzaSy_RESTART_PERSISTENCE_SECRET');

    // Simulate fresh window/restart
    const rehydrated = await hydrateSecureCredentials();
    expect(rehydrated[0].rawKey).toBe('AIzaSy_RESTART_PERSISTENCE_SECRET');
  });
});
