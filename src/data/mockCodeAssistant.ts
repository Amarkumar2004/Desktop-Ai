import type {
  ClarifyingQuestion,
  ImplementationPlan,
} from '@/types/codeAssistant';

export interface CodeTemplate {
  category: string;
  prompt: string;
  clarifications?: ClarifyingQuestion[];
  plan: ImplementationPlan;
}

export const MOCK_CODE_TEMPLATES: Record<string, CodeTemplate> = {
  'Build a component': {
    category: 'Build a component',
    prompt: 'Build a responsive Next.js login page with email/password fields, validation, and a clean dashboard-style design.',
    clarifications: [
      {
        id: 'q1',
        question: 'Which styling solution should be used for this component?',
        options: ['Tailwind CSS / Vanilla CSS classes', 'CSS Modules', 'Inline Styles'],
      },
      {
        id: 'q2',
        question: 'Should the component include third-party OAuth buttons (Google/GitHub)?',
        options: ['Yes, include Google OAuth button', 'Email/Password only', 'Full OAuth provider suite'],
      },
    ],
    plan: {
      summary: 'Construct a reusable, accessible LoginForm component with client-side field validation, loading indicators, and clean toast/alert feedback.',
      steps: [
        '1. Define strict TypeScript interfaces for login credentials and form state.',
        '2. Build accessible input fields with show/hide password toggling and live email format validation.',
        '3. Implement mock submit handler with asynchronous loading simulation and error handling.',
        '4. Add responsive layout wrappers suitable for desktop, tablet, and mobile displays.',
      ],
      affectedFiles: [
        'src/components/auth/LoginForm.tsx',
        'src/types/auth.ts',
      ],
      suggestedDependencies: ['lucide-react (Icons)', 'clsx / tailwind-merge'],
      risksAndNotes: [
        'Ensure password inputs never log sensitive keystrokes.',
        'No direct database connection is invoked in client form state.',
      ],
      proposedFiles: [
        {
          name: 'LoginForm.tsx',
          path: 'src/components/auth/LoginForm.tsx',
          language: 'tsx',
          description: 'Client component for user authentication with validation',
          code: `'use client';

import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface LoginFormProps {
  onSuccess?: (email: string) => void;
  onForgotPassword?: () => void;
}

export default function LoginForm({ onSuccess, onForgotPassword }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  const validateForm = () => {
    let valid = true;
    setEmailError('');
    setErrorMessage('');

    if (!email.trim()) {
      setEmailError('Email address is required.');
      valid = false;
    } else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    }

    if (!password) {
      setErrorMessage('Password is required.');
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Simulated authentication delay
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (onSuccess) onSuccess(email);
    } catch {
      setErrorMessage('Invalid credentials. Please verify your details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border border-stone-200/80 rounded-2xl shadow-sm p-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-stone-900 tracking-tight">Welcome back</h2>
        <p className="text-xs text-stone-500">Sign in to orchestrate your AI workforce.</p>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email Field */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-700 block">Work Email</label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@company.com"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden transition-all"
              disabled={isLoading}
              required
            />
            <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          {emailError && <p className="text-[11px] text-red-600 mt-1 font-medium">{emailError}</p>}
        </div>

        {/* Password Field */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-stone-700 block">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-10 py-2 text-xs text-stone-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-hidden font-mono transition-all"
              disabled={isLoading}
              required
            />
            <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Remember & Forgot */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none text-stone-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-amber-500 accent-amber-500 cursor-pointer"
            />
            <span>Remember me</span>
          </label>
          {onForgotPassword && (
            <button
              type="button"
              onClick={onForgotPassword}
              className="font-semibold text-amber-600 hover:text-amber-700 hover:underline"
            >
              Forgot password?
            </button>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              Sign in <ArrowRight className="w-3.5 h-3.5" />
            </span>
          )}
        </button>
      </form>
    </div>
  );
}`,
        },
        {
          name: 'auth.ts',
          path: 'src/types/auth.ts',
          language: 'typescript',
          description: 'Type contracts for authentication parameters',
          code: `export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthSessionResponse {
  user: {
    id: string;
    email: string;
    fullName?: string;
  } | null;
  error?: string;
}`,
        },
      ],
    },
  },
  'Fix an error': {
    category: 'Fix an error',
    prompt: 'Fix Next.js async cookies() type error: "Property cookies is not a Promise" in Supabase server helper.',
    plan: {
      summary: 'Update server Supabase helper to await cookies() in accordance with Next.js 15+ App Router asynchronous header APIs.',
      steps: [
        '1. Inspect Next.js 15/16 cookies() return signature from next/headers.',
        '2. Mark createClient helper as async: export async function createClient().',
        '3. Add const cookieStore = await cookies() before instantiating createServerClient.',
        '4. Wrap cookie modification handlers with try/catch to silence server component read-only warnings.',
      ],
      affectedFiles: ['src/lib/supabase/server.ts'],
      suggestedDependencies: ['@supabase/ssr@latest', 'next@latest'],
      risksAndNotes: [
        'Ensure all calling Server Components and Server Actions properly await createClient().',
      ],
      proposedFiles: [
        {
          name: 'server.ts',
          path: 'src/lib/supabase/server.ts',
          language: 'typescript',
          description: 'Next.js App Router async cookie Supabase client helper',
          code: `import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase public environment variables.');
  }

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored in read-only Server Component contexts
        }
      },
    },
  });
}`,
        },
      ],
    },
  },
  'Explain code': {
    category: 'Explain code',
    prompt: 'Explain the workspace-based Row Level Security (RLS) and SECURITY DEFINER helper function architecture.',
    plan: {
      summary: 'Comprehensive architecture explanation and reference documentation of the non-recursive RLS policy pattern.',
      steps: [
        '1. Break down the is_workspace_member() helper function and search_path isolation.',
        '2. Explain how RLS recursion is prevented when workspace_members queries are scoped.',
        '3. Detail authenticated vs anonymous access denial rules.',
      ],
      affectedFiles: ['docs/RLS_ARCHITECTURE_EXPLANATION.md'],
      suggestedDependencies: ['None (Documentation reference)'],
      risksAndNotes: ['Keep security definitions up-to-date when altering membership schemas.'],
      proposedFiles: [
        {
          name: 'RLS_ARCHITECTURE_EXPLANATION.md',
          path: 'docs/RLS_ARCHITECTURE_EXPLANATION.md',
          language: 'markdown',
          description: 'Detailed analysis of workspace-scoped database security architecture',
          code: `# Workspace-Based RLS Security Architecture

## 1. Threat Model & Design Goals
In a multi-tenant AI workforce platform, workspaces must achieve complete data isolation without risking cross-tenant leakage.

\`\`\`
[ Authenticated User: auth.uid() ]
               │
               ▼
[ is_workspace_member(workspace_id, auth.uid()) ]
               │
       ┌───────┴───────┐
       ▼               ▼
[ Member: ALLOW ]   [ Non-Member: DENY ]
\`\`\`

## 2. Preventing RLS Recursion
Standard RLS policies that query the \`workspace_members\` table directly within a \`workspace_members\` policy cause PostgreSQL infinite recursion errors.

**Solution:**
We encapsulate the membership lookup in a dedicated \`SECURITY DEFINER\` function:

\`\`\`sql
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
  );
$$;
\`\`\`

## 3. Search Path Isolation
Notice \`SET search_path = public\`. This prevents malicious users from injecting schema overrides during SECURITY DEFINER function execution.`,
        },
      ],
    },
  },
  'Refactor code': {
    category: 'Refactor code',
    prompt: 'Refactor state management into a reusable custom hook with optimistic updates and error rollback.',
    plan: {
      summary: 'Extract complex async task dispatching and state updates into a typed, decoupled useTaskMutation hook.',
      steps: [
        '1. Create generic useTaskMutation hook with optimistic state updates.',
        '2. Implement rollback mechanism if backend rejects task status.',
        '3. Provide clean mutation helpers (boost, complete, delete).',
      ],
      affectedFiles: ['src/lib/hooks/useTaskMutation.ts'],
      suggestedDependencies: ['react@19'],
      risksAndNotes: ['Ensure parent components receive memoized callbacks to prevent re-render cascades.'],
      proposedFiles: [
        {
          name: 'useTaskMutation.ts',
          path: 'src/lib/hooks/useTaskMutation.ts',
          language: 'typescript',
          description: 'Custom React hook for optimistic task operations and rollback',
          code: `'use client';

import { useState, useCallback } from 'react';
import type { Task } from '@/types/database';

interface UseTaskMutationOptions {
  onSuccess?: (task: Task) => void;
  onError?: (error: Error, previousTask?: Task) => void;
}

export function useTaskMutation(options?: UseTaskMutationOptions) {
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const boostTaskProgress = useCallback(
    async (task: Task, delta: number = 15): Promise<Task> => {
      setIsMutating(true);
      setError(null);
      const originalProgress = task.progress;
      const optimisticProgress = Math.min(100, originalProgress + delta);

      try {
        // Optimistic object
        const updated: Task = {
          ...task,
          progress: optimisticProgress,
          status: optimisticProgress >= 100 ? 'completed' : 'in_progress',
        };

        if (options?.onSuccess) options.onSuccess(updated);
        return updated;
      } catch (err) {
        const errorObj = err instanceof Error ? err : new Error('Failed to mutate task');
        setError(errorObj);
        if (options?.onError) options.onError(errorObj, task);
        throw errorObj;
      } finally {
        setIsMutating(false);
      }
    },
    [options]
  );

  return {
    boostTaskProgress,
    isMutating,
    error,
  };
}`,
        },
      ],
    },
  },
  'Add a feature': {
    category: 'Add a feature',
    prompt: 'Add an in-memory token bucket rate limiter for AI provider requests to prevent API quota exhaustion.',
    plan: {
      summary: 'Implement a thread-safe token bucket rate limiter module with customizable refill rates and burst capacities.',
      steps: [
        '1. Define TokenBucket class with refill interval and maximum token capacity.',
        '2. Implement acquire() method with async wait capability.',
        '3. Create provider-specific rate limiter singleton map for Gemini, OpenAI, Claude, and Groq.',
      ],
      affectedFiles: ['src/backend/utils/rateLimiter.ts'],
      suggestedDependencies: ['None (Zero-dependency in-memory implementation)'],
      risksAndNotes: ['In multi-instance serverless deployments, use Redis or Upstash for distributed rate limiting.'],
      proposedFiles: [
        {
          name: 'rateLimiter.ts',
          path: 'src/backend/utils/rateLimiter.ts',
          language: 'typescript',
          description: 'In-memory token bucket rate limiter for AI provider requests',
          code: `/**
 * In-Memory Token Bucket Rate Limiter
 * Protects AI provider endpoints from quota exhaustion.
 */

export class TokenBucket {
  private capacity: number;
  private refillRatePerSecond: number;
  private tokens: number;
  private lastRefillTimestamp: number;

  constructor(capacity: number, refillRatePerSecond: number) {
    this.capacity = capacity;
    this.refillRatePerSecond = refillRatePerSecond;
    this.tokens = capacity;
    this.lastRefillTimestamp = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTimestamp) / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRatePerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTimestamp = now;
  }

  public tryConsume(tokensRequired: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return true;
    }
    return false;
  }

  public getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Global provider rate limiters (Requests Per Minute)
export const PROVIDER_RATE_LIMITERS = {
  gemini: new TokenBucket(60, 1),    // 60 rpm burst, 1 rps refill
  groq: new TokenBucket(30, 0.5),    // 30 rpm burst
  openai: new TokenBucket(50, 0.8),  // 50 rpm burst
  anthropic: new TokenBucket(40, 0.6),
};`,
        },
      ],
    },
  },
};
