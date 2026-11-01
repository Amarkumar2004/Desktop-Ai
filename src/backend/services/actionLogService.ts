import type { ActionLog } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

export interface CreateActionLogInput {
  userId?: string | null;
  requestId: string;
  actionType: string;
  target?: string | null;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  status?: 'APPROVED' | 'DENIED' | 'REQUIRES_APPROVAL';
  executionResult?: Record<string, any>;
}

/**
 * Persists an action audit log to Supabase.
 */
export async function logAction(input: CreateActionLogInput): Promise<ActionLog> {
  const riskLevel = input.riskLevel || 'LOW';
  const status = input.status || 'APPROVED';

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('action_logs')
        .insert({
          user_id: input.userId || null,
          request_id: input.requestId,
          action_type: input.actionType,
          target: input.target || null,
          risk_level: riskLevel,
          status,
          execution_result: input.executionResult || {},
        })
        .select()
        .single();

      if (error) {
        console.error('[actionLogService] Error logging action to Supabase:', error.message);
        // Do not throw here so business operations aren't blocked, but log clearly
      } else if (data) {
        return data;
      }
    }
  }

  return {
    id: `log_${Date.now()}`,
    user_id: input.userId || null,
    request_id: input.requestId,
    action_type: input.actionType,
    target: input.target || null,
    risk_level: riskLevel,
    status,
    execution_result: input.executionResult || {},
    created_at: new Date().toISOString(),
  };
}

/**
 * Retrieves recent action audit logs.
 */
export async function getActionLogs(
  userId?: string,
  limit: number = 50
): Promise<ActionLog[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      let query = supabase
        .from('action_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[actionLogService] Error fetching action logs:', error.message);
        throw new Error(`Failed to load action logs: ${error.message} (${error.code})`);
      }

      return data || [];
    }
  }

  return [];
}
