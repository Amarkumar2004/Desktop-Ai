/**
 * Real-time Multilingual Voice Assistant Type Definitions
 * Server-safe, client-safe ephemeral voice session contracts & ZovaAI-style pipeline definitions.
 * Desktop ready for future Tauri / Local Native integration.
 */

import type { LocalAccessCapability, ActionRiskLevel } from './localActions';

export type RealtimeVoiceProvider =
  | 'local_ollama'
  | 'free_local'
  | 'google_gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'openrouter'
  | 'vertex_ai'
  | 'huggingface'
  | 'custom_openai'
  | 'unsupported';

export type VoiceMode = 'auto' | 'online' | 'offline';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
export type RealtimeVoiceSessionState =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
export type VoiceLang = 'hi-IN' | 'en-IN' | 'en-US';

export type VoiceTransportType = 'webrtc' | 'websocket' | 'http_stream' | 'local_native' | 'none';

export interface RealtimeVoiceCapability {
  providerId: RealtimeVoiceProvider;
  supportsRealtimeAudio: boolean;
  supportsBargeIn: boolean;
  supportsTaskPlanning: boolean;
  preferredTransport: VoiceTransportType;
  defaultModel: string;
  supportedModels: string[];
  maxSessionDurationSeconds: number;
}

export interface VoiceLanguagePreference {
  mode: 'auto' | 'manual';
  detectedLanguage?: 'hi' | 'en' | 'hinglish' | string;
  detectedScript?: 'devanagari' | 'roman' | 'latin';
  preferredLanguage?: 'auto' | 'hi' | 'en' | 'hinglish';
  confidence?: number;
}

export interface VoiceTranscriptSegment {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: string;
  language?: string;
  script?: 'devanagari' | 'roman' | 'latin';
}

export interface VoiceResponseSegment {
  id: string;
  sessionId: string;
  textChunk: string;
  audioChunk?: ArrayBuffer | string; // Base64 or PCM audio chunk
  isFinal: boolean;
  timestamp: string;
}

export interface VoiceProcessResult {
  replyText: string;
  assignedAgent: 'LEX' | 'SUSI' | 'SPY' | 'YORU';
  modeUsed: 'online' | 'offline';
  sourceProvider?: 'cloud_api' | 'ollama' | 'gemini' | 'local_smart';
  modelName?: string;
  audioUrl?: string;
  action?: {
    type: 'CREATE_TASK' | 'CREATE_FILE' | 'RUN_DIAGNOSTICS' | 'NAVIGATE_TAB' | 'OPEN_URL' | 'SYSTEM_INFO' | 'CHAT_REPLY';
    payload?: Record<string, unknown>;
  };
  metrics?: {
    cpuPercent: number;
    memoryPercent: number;
    uptime: string;
  };
}

export interface VoiceSessionToken {
  token: string;
  sessionId: string;
  provider: RealtimeVoiceProvider;
  model: string;
  transport: VoiceTransportType;
  endpointUrl?: string;
  iceServers?: RTCIceServer[];
  expiresAt: string; // ISO String (strict short-lived TTL)
  maxDurationSeconds: number;
}

export interface VoiceSessionError {
  code:
    | 'MIC_PERMISSION_DENIED'
    | 'MIC_UNAVAILABLE'
    | 'OLLAMA_UNAVAILABLE'
    | 'MODEL_UNAVAILABLE'
    | 'STT_FAILURE'
    | 'TTS_FAILURE'
    | 'USER_INTERRUPTED'
    | 'PROVIDER_UNSUPPORTED'
    | 'SESSION_EXPIRED'
    | 'CONNECTION_FAILED'
    | 'BARGE_IN_ERROR'
    | 'TASK_PLAN_ERROR'
    | 'ACTION_REJECTED'
    | 'NETWORK_ERROR'
    | 'AUDIO_DEVICE_ERROR'
    | 'UNKNOWN_ERROR';
  message: string;
  retryable: boolean;
  details?: string;
}

export interface RealtimeVoiceSession {
  id: string;
  providerId: RealtimeVoiceProvider;
  providerLabel: string;
  model: string;
  state: RealtimeVoiceSessionState;
  transport: VoiceTransportType;
  languagePreference: VoiceLanguagePreference;
  startedAt?: string;
  endedAt?: string;
  isMuted: boolean;
  isBargeInActive: boolean;
  activePlan?: VoiceTaskPlan;
  activeApproval?: VoiceActionApprovalRequest;
  error?: VoiceSessionError;
}

export interface VoiceTaskPlanItem {
  id: string;
  order: number;
  description: string;
  actionType: LocalAccessCapability | 'search' | 'reminder' | 'query' | 'generic';
  toolName?: string;
  parameters?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval' | 'cancelled';
  sensitive: boolean;
  requiresConfirmation: boolean;
  dependsOn?: string[];
  resultSummary?: string;
  approvalToken?: string;
  errorMessage?: string;
}

export interface VoiceTaskPlan {
  id: string;
  sessionId: string;
  originalPrompt: string;
  detectedLanguage?: string;
  tasks: VoiceTaskPlanItem[];
  status: 'planning' | 'in_progress' | 'awaiting_confirmation' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  completedSummary?: string;
}

export interface VoiceActionApprovalRequest {
  id: string;
  planId: string;
  taskId: string;
  actionType: LocalAccessCapability | string;
  target: string;
  details: string;
  riskLevel: ActionRiskLevel;
  confirmationPrompt: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt: string;
  approvalToken?: string;
}

// -----------------------------------------------------------------------------
// Phase 5 Desktop Ready Interface Contracts (Tauri / Local Pipeline)
// -----------------------------------------------------------------------------

export type VoiceIntentType = 'local_system' | 'local_file' | 'local_task' | 'global_search' | 'global_knowledge' | 'chat';

export interface VoiceIntent {
  type: VoiceIntentType;
  isLocal: boolean;
  confidence: number;
  extractedEntities?: Record<string, string>;
  rawPrompt: string;
}

export interface ISpeechToText {
  transcribe(audioBlob: Blob, language?: string): Promise<{ text: string; language?: string }>;
  startStreaming?(onPartial: (text: string) => void): Promise<void>;
  stopStreaming?(): Promise<string>;
}

export interface ITextToSpeech {
  synthesize(text: string, options?: { voice?: string; rate?: number; language?: string }): Promise<ArrayBuffer | Blob | null>;
  speak(text: string, options?: { voice?: string; rate?: number; onStart?: () => void; onEnd?: () => void; onError?: (err: Error) => void }): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}

export interface IVoiceActivityDetection {
  attachStream(stream: MediaStream): void;
  start(onSpeechStart: () => void, onSpeechEnd: () => void): void;
  stop(): void;
  setSensitivity(threshold: number): void;
}

export interface IWakeWordDetector {
  start(onWakeWordDetected: (wakeWord: string) => void): void;
  stop(): void;
  processTranscript(transcript: string): boolean;
  processAudioFrame?(audioData: Float32Array): boolean;
}

export interface IAIModelRouter {
  routeIntent(prompt: string, history?: Array<{ role: 'user' | 'assistant' | 'system' | string; content: string }>, mode?: VoiceMode): Promise<VoiceIntent>;
}

export interface IToolExecutor {
  execute(actionType: string, payload: Record<string, unknown>, requiresApproval?: boolean): Promise<{ success: boolean; message: string; result?: unknown }>;
}
