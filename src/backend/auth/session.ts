import { createServerClient } from '../supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Server-Side Authentication & Authorization Helper
 * Derives user identity strictly from verified server session cookies.
 */

export interface AuthenticatedContext {
  user: User;
}

export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const supabase = await createServerClient();
    if (!supabase) {
      return null;
    }
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<User> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
