import type { Agent, AgentStatus, AgentId } from '@/types/dashboard';
import { INITIAL_AGENTS } from '@/data/initialData';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const STORAGE_KEY_AGENTS = 'susi_ai_agents_v3';

export function getStoredAgents(): Agent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AGENTS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveStoredAgents(agents: Agent[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents));
    window.dispatchEvent(new CustomEvent('susi-agents-updated', { detail: { agents } }));
  } catch (err) {
    console.error('Failed to save agents', err);
  }
}

export async function getAgents(): Promise<Agent[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await (supabase as any).from('agents').select('*');
        if (!error && data) {
          const mapped: Agent[] = data.map((a: any) => {
            const match = INITIAL_AGENTS.find((ia) => ia.id.toLowerCase() === a.id?.toLowerCase());
            if (!match) return null;
            return {
              ...match,
              name: a.name || match.name,
              role: a.role || match.role,
              status: (a.status as AgentStatus) || match.status,
            };
          }).filter((agent: Agent | null): agent is Agent => agent !== null);
          saveStoredAgents(mapped);
          return mapped;
        }
      }
    } catch (err) {
      console.warn('[agentService] Supabase agents fallback to local cache:', err);
    }
  }

  return [];
}

export async function updateAgentStatus(
  agentId: string,
  status: AgentStatus,
  currentTask?: string
): Promise<Agent | null> {
  const agents = getStoredAgents();
  let updatedAgent: Agent | null = null;

  const updated = agents.map((a) => {
    if (a.id.toLowerCase() === agentId.toLowerCase() || a.name.toLowerCase() === agentId.toLowerCase()) {
      updatedAgent = {
        ...a,
        status,
        currentTask: currentTask !== undefined ? currentTask : a.currentTask,
      };
      return updatedAgent;
    }
    return a;
  });

  if (updatedAgent) {
    saveStoredAgents(updated);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        if (supabase) {
          await (supabase as any).from('agents').update({
            status: status.toLowerCase(),
          }).eq('id', agentId);
        }
      } catch (err) {
        console.warn('[agentService] Supabase agent status update notice:', err);
      }
    }
  }

  return updatedAgent;
}

export async function getAgentById(id: AgentId): Promise<Agent | undefined> {
  const agents = await getAgents();
  return agents.find((a) => a.id.toLowerCase() === id.toLowerCase());
}
