'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createSupabaseClient, isSupabaseConfigured } from '@/backend/supabase/client';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  workspaceName: string;
  role: string;
  avatarInitials: string;
  avatarUrl?: string;
  createdAt: string;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signup: (data: { fullName: string; email: string; workspaceName: string; password?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => void;
}

function getInitials(name: string): string {
  if (!name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function mapSupabaseUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown>; created_at: string }): UserProfile {
  const fullName = String(u.user_metadata?.full_name || u.email?.split('@')[0] || 'User');
  return {
    id: u.id,
    email: u.email || '',
    fullName,
    workspaceName: String(u.user_metadata?.workspace_name || 'My Workspace'),
    role: 'Workspace Member',
    avatarInitials: getInitials(fullName),
    createdAt: u.created_at,
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    const supabase = isSupabaseConfigured() ? createSupabaseClient() : null;

    if (!supabase) {
      setUser(null);
      setIsLoading(false);
      return () => { mounted = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setIsLoading(false);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      setUser(!error && data.session?.user ? mapSupabaseUser(data.session.user) : null);
      setIsLoading(false);
    }).catch(() => {
      if (mounted) {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured. Configure the project URL and public anon/publishable key first.' };
      if (!password?.trim()) return { success: false, error: 'Password is required.' };
      const supabase = createSupabaseClient();
      if (!supabase) return { success: false, error: 'Unable to initialize Supabase authentication.' };
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { success: false, error: error.message };
      if (!data.session || !data.user) return { success: false, error: 'Supabase did not return an authenticated session.' };
      setUser(mapSupabaseUser(data.user));
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async ({ fullName, email, workspaceName, password }: {
    fullName: string; email: string; workspaceName: string; password?: string;
  }) => {
    setIsLoading(true);
    try {
      if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured. Configure the project URL and public anon/publishable key first.' };
      if (!password?.trim()) return { success: false, error: 'Password is required.' };
      if (!email.trim() || !fullName.trim()) return { success: false, error: 'Name and email are required.' };
      const supabase = createSupabaseClient();
      if (!supabase) return { success: false, error: 'Unable to initialize Supabase authentication.' };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim(), workspace_name: workspaceName.trim() || 'My Workspace' } },
      });
      if (error) return { success: false, error: error.message };
      if (data.session && data.user) {
        setUser(mapSupabaseUser(data.user));
        return { success: true };
      }
      return { success: false, error: 'Account created. Confirm your email, then sign in.' };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Registration failed' };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const supabase = isSupabaseConfigured() ? createSupabaseClient() : null;
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) console.error('[Auth] Supabase sign-out failed:', error.message);
    }
    setUser(null);
    router.push('/login');
  }, [router]);

  const updateProfile = useCallback((data: Partial<UserProfile>) => {
    setUser((prev) => prev ? {
      ...prev,
      ...data,
      avatarInitials: data.fullName ? getInitials(data.fullName) : prev.avatarInitials,
    } : null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
