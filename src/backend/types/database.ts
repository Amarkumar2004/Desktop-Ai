export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Profile = {
  id: string; // references auth.users(id)
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  role: string;
  theme: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  owner_id: string; // references auth.users(id)
  plan: 'starter' | 'pro' | 'enterprise';
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string; // references workspaces.id
  user_id: string; // references auth.users(id)
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
};

export type UserSettings = {
  user_id: string; // PK references auth.users(id)
  theme: 'light' | 'dark' | 'system';
  voice_enabled: boolean;
  voice_provider: string;
  selected_model: string;
  auto_read: boolean;
  audio_vad_sensitivity: string;
  preferences: Json;
  updated_at: string;
};

export type Conversation = {
  id: string;
  user_id: string; // references auth.users(id)
  workspace_id: string | null;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string; // references conversations.id
  user_id: string; // references auth.users(id)
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata: Json;
  created_at: string;
};

export type Task = {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  title: string;
  description: string | null;
  assigned_agent: string;
  priority: string;
  status: 'queued' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'paused';
  category: string;
  progress: number;
  completed: boolean;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskStep = {
  id: string;
  task_id: string;
  step_index: number;
  action_type: string;
  title: string | null;
  payload: Json;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked' | 'requires_approval';
  result: Json | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type ProviderConnection = {
  id: string;
  user_id: string;
  provider: string;
  provider_label: string;
  display_name: string | null;
  masked_key_suffix: string;
  base_url: string | null;
  selected_model: string;
  available_models: Json;
  status: 'connected' | 'not_connected' | 'needs_attention';
  capabilities: Json;
  created_at: string;
  updated_at: string;
};

export type ActionLog = {
  id: string;
  user_id: string | null;
  request_id: string;
  action_type: string;
  target: string | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'APPROVED' | 'DENIED' | 'REQUIRES_APPROVAL';
  execution_result: Json;
  created_at: string;
};

export type NotificationPreferences = {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  agent_alerts: boolean;
  weekly_digest: boolean;
  security_alerts: boolean;
  created_at: string;
  updated_at: string;
};

export type Agent = {
  id: string;
  workspace_id: string | null;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'ready' | 'offline' | 'error';
  color: string;
  avatar_url: string | null;
  current_task_id: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
};

export type AgentEvent = {
  id: string;
  agent_id: string;
  workspace_id: string | null;
  event_type: 'task_started' | 'task_completed' | 'status_change' | 'log' | 'error';
  message: string;
  payload: Json | null;
  created_at: string;
};

export type AgentRun = { id: string; task_id: string; user_id: string | null; manager_agent: 'SUSI'; status: 'queued' | 'planning' | 'running' | 'completed' | 'failed' | 'cancelled'; plan: Json; created_at: string; updated_at: string; completed_at: string | null; };
export type AgentMessage = { id: string; run_id: string; task_id: string; user_id: string | null; from_agent: 'SUSI' | 'SPY' | 'EURO' | 'LEX'; to_agent: 'SUSI' | 'SPY' | 'EURO' | 'LEX' | 'ALL' | null; message_type: 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note'; content: string; metadata: Json; created_at: string; };
export type AgentMemory = { id: string; user_id: string | null; agent_id: 'SUSI' | 'SPY' | 'EURO' | 'LEX'; memory_key: string; content: Json; created_at: string; updated_at: string; };
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      workspaces: {
        Row: Workspace;
        Insert: Partial<Workspace> & { name: string; slug: string; owner_id: string };
        Update: Partial<Workspace>;
        Relationships: [];
      };
      workspace_members: {
        Row: WorkspaceMember;
        Insert: Partial<WorkspaceMember> & { workspace_id: string; user_id: string };
        Update: Partial<WorkspaceMember>;
        Relationships: [];
      };
      user_settings: {
        Row: UserSettings;
        Insert: Partial<UserSettings> & { user_id: string };
        Update: Partial<UserSettings>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> & { user_id: string };
        Update: Partial<Conversation>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & { conversation_id: string; user_id: string; role: Message['role']; content: string };
        Update: Partial<Message>;
        Relationships: [];
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & { title: string };
        Update: Partial<Task>;
        Relationships: [];
      };
      task_steps: {
        Row: TaskStep;
        Insert: Partial<TaskStep> & { task_id: string; step_index: number; action_type: string };
        Update: Partial<TaskStep>;
        Relationships: [];
      };
      provider_connections: {
        Row: ProviderConnection;
        Insert: Partial<ProviderConnection> & { id: string; user_id: string; provider: string; provider_label: string; masked_key_suffix: string; selected_model: string };
        Update: Partial<ProviderConnection>;
        Relationships: [];
      };
      action_logs: {
        Row: ActionLog;
        Insert: Partial<ActionLog> & { request_id: string; action_type: string };
        Update: Partial<ActionLog>;
        Relationships: [];
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Partial<NotificationPreferences> & { user_id: string };
        Update: Partial<NotificationPreferences>;
        Relationships: [];
      };
      agents: {
        Row: Agent;
        Insert: Partial<Agent> & { name: string; role: string };
        Update: Partial<Agent>;
        Relationships: [];
      };
      agent_runs: { Row: AgentRun; Insert: Partial<AgentRun> & { task_id: string; user_id?: string | null }; Update: Partial<AgentRun>; Relationships: []; };
      agent_messages: { Row: AgentMessage; Insert: Partial<AgentMessage> & { run_id: string; task_id: string; user_id?: string | null; from_agent: AgentMessage['from_agent']; message_type: AgentMessage['message_type']; content: string }; Update: Partial<AgentMessage>; Relationships: []; };
      agent_memory: { Row: AgentMemory; Insert: Partial<AgentMemory> & { user_id?: string | null; agent_id: AgentMemory['agent_id']; memory_key: string; content: Json }; Update: Partial<AgentMemory>; Relationships: []; };
      agent_events: {
        Row: AgentEvent;
        Insert: Partial<AgentEvent> & { agent_id: string; event_type: AgentEvent['event_type']; message: string };
        Update: Partial<AgentEvent>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_workspace_member: {
        Args: { p_workspace_id: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
