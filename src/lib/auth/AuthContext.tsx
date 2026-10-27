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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Restore session from localStorage on load
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTH);
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        // Initial active session default for seamless workspace experience
        setUser(DEFAULT_USER);
        localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(DEFAULT_USER));
      }
    } catch {
      setUser(DEFAULT_USER);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, _password?: string) => {
    setIsLoading(true);
    try {
      // Simulate real auth handshake / Supabase integration
      await new Promise((resolve) => setTimeout(resolve, 600));

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
  }: {
    fullName: string;
    email: string;
    workspaceName: string;
    password?: string;
  }) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));

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
