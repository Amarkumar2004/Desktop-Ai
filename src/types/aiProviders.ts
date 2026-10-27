/**
 * BYOK (Bring Your Own API Key) Architecture Type Definitions
 * Strict client-safe metadata models that never expose raw API keys.
 */

export type AiProviderId =
  | 'freellm'
  | 'google_gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'vertex_ai'
  | 'huggingface'
  | 'custom_openai';

export type ProviderCapability = 'voice' | 'chat' | 'code';

export type ProviderConnectionStatus = 'connected' | 'not_connected' | 'needs_attention';

export interface AiProviderConfig {
  id: AiProviderId;
  name: string;
  category: 'Major LLM' | 'High-Speed' | 'Open Source / Gateway' | 'Custom';
  description: string;
  defaultModels: string[];
  placeholderKeyFormat: string;
  requiresBaseUrl?: boolean;
  defaultBaseUrl?: string;
}

export interface ProviderConnectionMetadata {
  id: string;
  workspaceId: string;
  provider: AiProviderId;
  providerLabel: string;
  displayName?: string;
  maskedKeySuffix: string; // e.g. "••••1234"
  rawKey?: string; // Stored strictly in client local vault for BYOK dispatch
  baseUrl?: string;
  selectedModel: string;
  availableModels: string[];
  status: ProviderConnectionStatus;
  capabilities: {
    voice: boolean;
    chat: boolean;
    code: boolean;
  };
  createdAt: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
}

export interface ProviderModelSelection {
  voiceProviderId?: string;
  voiceModel?: string;
  chatProviderId?: string;
  chatModel?: string;
  codeProviderId?: string;
  codeModel?: string;
}

/**
 * Code Assistant Safety Plan Types
 * Code outputs are strictly preview-only until explicit user approval workflows exist.
 */
export interface CodeAssistantRequest {
  prompt: string;
  language?: string;
  context?: string;
  workspaceId: string;
  requireConfirmation: true; // Hard constraint: Write operations require explicit user approval
}

export interface CodeAssistantResponse {
  previewCode: string;
  language: string;
  explanation: string;
  safetyWarning: string;
  status: 'preview_only';
  generatedAt: string;
}
