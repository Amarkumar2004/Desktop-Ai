'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

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

const STORAGE_KEY_AUTH = 'susi_ai_auth_user';

const DEFAULT_USER: UserProfile = {
  id: 'usr-default-alex',
  email: 'alex.rivera@susi.ai',
  fullName: 'Alex Rivera',
  workspaceName: 'Acme Autonomous Labs',
  role: 'Lead Architect',
  avatarInitials: 'AR',
  createdAt: '2026-01-15T00:00:00Z',
};

function getInitials(name: string): string {
  if (!name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

import { createClient as createSupabaseClient, isSupabaseConfigured } from '@/backend/supabase/client';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session from Supabase if configured, otherwise localStorage
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        if (isSupabaseConfigured()) {
          const supabase = createSupabaseClient();
          if (supabase) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              const u = session.user;
              const profile: UserProfile = {
                id: u.id,
                email: u.email || 'user@susi.ai',
                fullName: u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
                workspaceName: u.user_metadata?.workspace_name || 'My Workspace',
                role: 'Workspace Member',
                avatarInitials: getInitials(u.user_metadata?.full_name || u.email || 'User'),
                createdAt: u.created_at,
              };
              if (mounted) setUser(profile);
              localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(profile));
              return;
            }
          }
        }

        const stored = localStorage.getItem(STORAGE_KEY_AUTH);
        if (stored) {
          if (mounted) setUser(JSON.parse(stored));
        } else {
          if (mounted) setUser(DEFAULT_USER);
          localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(DEFAULT_USER));
        }
      } catch {
        if (mounted) setUser(DEFAULT_USER);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured() && password) {
        const supabase = createSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) {
            return { success: false, error: error.message };
          }
          if (data.user) {
            const u = data.user;
            const activeUser: UserProfile = {
              id: u.id,
              email: u.email || email,
              fullName: u.user_metadata?.full_name || email.split('@')[0],
              workspaceName: u.user_metadata?.workspace_name || 'My Workspace',
              role: 'Workspace Member',
              avatarInitials: getInitials(u.user_metadata?.full_name || email),
              createdAt: u.created_at,
            };
            setUser(activeUser);
            localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(activeUser));
            return { success: true };
          }
        }
      }

      // Offline / Local Workspace session handling
      await new Promise((resolve) => setTimeout(resolve, 300));

      const existingStored = localStorage.getItem(STORAGE_KEY_AUTH);
      let activeUser: UserProfile = DEFAULT_USER;

      if (existingStored) {
        const parsed = JSON.parse(existingStored);
        if (parsed.email.toLowerCase() === email.toLowerCase()) {
          activeUser = parsed;
        } else {
          activeUser = {
            ...DEFAULT_USER,
            id: `usr-${Date.now()}`,
            email: email.trim(),
            fullName: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            avatarInitials: getInitials(email.split('@')[0]),
          };
        }
      } else {
        activeUser = {
          ...DEFAULT_USER,
          id: `usr-${Date.now()}`,
          email: email.trim(),
          fullName: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          avatarInitials: getInitials(email.split('@')[0]),
        };
      }

      setUser(activeUser);
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(activeUser));
      return { success: true };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signup = useCallback(async ({
    fullName,
    email,
    workspaceName,
    password,
  }: {
    fullName: string;
    email: string;
    workspaceName: string;
    password?: string;
  }) => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured() && password) {
        const supabase = createSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                workspace_name: workspaceName.trim() || 'My Workspace',
              },
            },
          });
          if (error) {
            return { success: false, error: error.message };
          }
          if (data.user) {
            const newUser: UserProfile = {
              id: data.user.id,
              email: data.user.email || email.trim(),
              fullName: fullName.trim(),
              workspaceName: workspaceName.trim() || 'My Workspace',
              role: 'Workspace Admin',
              avatarInitials: getInitials(fullName),
              createdAt: new Date().toISOString(),
            };
            setUser(newUser);
            localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(newUser));
            return { success: true };
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 400));

      const newUser: UserProfile = {
        id: `usr-${Date.now()}`,
        email: email.trim(),
        fullName: fullName.trim(),
        workspaceName: workspaceName.trim() || 'My Workspace',
        role: 'Workspace Admin',
        avatarInitials: getInitials(fullName),
        createdAt: new Date().toISOString(),
      };

      setUser(newUser);
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(newUser));
      return { success: true };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createSupabaseClient();
        if (supabase) {
          await supabase.auth.signOut();
        }
      } catch {
        // Ignore signout error
      }
    }
    localStorage.removeItem(STORAGE_KEY_AUTH);
    setUser(null);
    router.push('/login');
  }, [router]);

  const updateProfile = useCallback((data: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated: UserProfile = {
        ...prev,
        ...data,
        avatarInitials: data.fullName ? getInitials(data.fullName) : prev.avatarInitials,
      };
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
