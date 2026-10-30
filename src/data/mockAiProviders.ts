import type {
  AiProviderConfig,
  ProviderConnectionMetadata,
} from '@/types/aiProviders';

export interface ExtendedAiProviderConfig extends AiProviderConfig {
  keyLabel: string;
  keyHint: string;
}

export const AI_PROVIDERS_CATALOG: ExtendedAiProviderConfig[] = [
  {
    id: 'freellm',
    name: 'FreeLLMMap / AI Gateway',
    category: 'Open Source / Gateway',
    description: 'Unified multi-agent API connecting Claude, DeepSeek, Llama, Qwen & GPT via one key.',
    keyLabel: 'FreeLLMMap API Key',
    keyHint: 'Paste your unified FreeLLMMap key.',
    defaultModels: ['deepseek/deepseek-chat', 'claude-3-5-sonnet', 'qwen-2.5-coder', 'meta-llama/llama-3.3-70b-instruct'],
    placeholderKeyFormat: 'flm_••••••••••••••••••••••••••••••••',
    requiresBaseUrl: true,
    defaultBaseUrl: 'https://api.freellmmap.com/v1',
  },
  {
    id: 'google_gemini',
    name: 'Google Gemini',
    category: 'Major LLM',
    description: 'Gemini API for chat, multimodal tasks, voice workflows, and coding.',
    keyLabel: 'Gemini API Key',
    keyHint: 'Create this key in Google AI Studio, then paste it here.',
    defaultModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    placeholderKeyFormat: 'AIzaSy•••••••••••••••••••••••••••••••',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'Major LLM',
    description: 'OpenAI models for chat, reasoning, and coding.',
    keyLabel: 'OpenAI API Key',
    keyHint: 'Paste your OpenAI API key.',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o1-preview'],
    placeholderKeyFormat: 'sk-proj-•••••••••••••••••••••••••••••••',
  },
  {
    id: 'anthropic',
    name: 'Claude AI (Anthropic)',
    category: 'Major LLM',
    description: 'Claude models for reasoning and coding.',
    keyLabel: 'Anthropic API Key',
    keyHint: 'Paste your Anthropic API key.',
    defaultModels: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
    placeholderKeyFormat: 'sk-ant-api03-••••••••••••••••••••••••',
  },
  {
    id: 'groq',
    name: 'Groq',
    category: 'High-Speed',
    description: 'Fast inference for supported open models.',
    keyLabel: 'Groq API Key',
    keyHint: 'Paste your Groq API key.',
    defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    placeholderKeyFormat: 'gsk_••••••••••••••••••••••••••••••••••',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'Open Source / Gateway',
    description: 'Access multiple model providers through one API.',
    keyLabel: 'OpenRouter API Key',
    keyHint: 'Paste your OpenRouter API key.',
    defaultModels: ['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat', 'meta-llama/llama-3.3-70b-instruct'],
    placeholderKeyFormat: 'sk-or-v1-••••••••••••••••••••••••••••',
  },
  {
    id: 'vertex_ai',
    name: 'Google Cloud Vertex AI',
    category: 'Major LLM',
    description: 'Enterprise Gemini access through Google Cloud.',
    keyLabel: 'Vertex AI credential',
    keyHint: 'Enterprise setup will require secure server-side configuration.',
    defaultModels: ['gemini-1.5-pro@002', 'gemini-1.5-flash@002'],
    placeholderKeyFormat: 'ya29.••••••••••••••••••••••••••••••••',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'Open Source / Gateway',
    description: 'Use hosted open-source models.',
    keyLabel: 'Hugging Face Token',
    keyHint: 'Paste your Hugging Face access token.',
    defaultModels: ['meta-llama/Meta-Llama-3-70B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'],
    placeholderKeyFormat: 'hf_••••••••••••••••••••••••••••••••••',
  },
  {
    id: 'custom_openai',
    name: 'Custom OpenAI-Compatible',
    category: 'Custom',
    description: 'Connect a compatible provider endpoint.',
    keyLabel: 'Provider API Key',
    keyHint: 'Paste key/token for your custom endpoint.',
    defaultModels: ['default-model', 'custom-model-v1'],
    placeholderKeyFormat: 'Bearer •••••••••••••••••••••••••••••••',
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
  },
];

export const INITIAL_MOCK_CONNECTIONS: ProviderConnectionMetadata[] = [];
