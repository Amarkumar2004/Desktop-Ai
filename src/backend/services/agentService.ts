import type { Agent, AgentStatus, AgentId } from '@/types/dashboard';
import { INITIAL_AGENTS } from '@/data/initialData';

const STORAGE_KEY_AGENTS = 'susi_ai_agents_v2';

export function getStoredAgents(): Agent[] {
  if (typeof window === 'undefined') return INITIAL_AGENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AGENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(INITIAL_AGENTS));
      return INITIAL_AGENTS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_AGENTS;
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
  return getStoredAgents();
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
  }
  return updatedAgent;
}

export async function addAgent(agentData: Partial<Agent> & { name: string; role: string }): Promise<Agent> {
  const agents = getStoredAgents();
  const id = agentData.name.toLowerCase().replace(/\s+/g, '-') as AgentId;
  const newAgent: Agent = {
    id,
    name: agentData.name.toUpperCase(),
    role: agentData.role,
    title: agentData.title || `${agentData.name} Specialist`,
    status: (agentData.status as AgentStatus) || 'Online',
    color: agentData.color || '#3B82F6',
    accentColor: agentData.accentColor || 'rgb(59, 130, 246)',
    bgLight: 'bg-blue-50',
    borderLight: 'border-blue-200',
    textColor: 'text-blue-700',
    avatarSeed: `${id}_avatar`,
    room: agentData.room || 'research-lab',
    specialty: agentData.specialty || 'General Intelligence & Analytics',
    efficiency: agentData.efficiency || 98.0,
    memoryUsage: '3.0 GB',
    taskCount: 0,
    currentTask: 'Ready for assignment',
    level: 1,
    coordinates: { x: 400, y: 200 },
  };

  const updated = [...agents, newAgent];
  saveStoredAgents(updated);
  return newAgent;
}
