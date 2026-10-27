export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Profile {
  id: string; // references auth.users
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  role: string | null;
  theme: 'light' | 'dark' | 'system';
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string; // references profiles.id
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string; // references workspaces.id
  user_id: string; // references profiles.id
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joined_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string; // references profiles.id
  email_notifications: boolean;
  push_notifications: boolean;
  agent_alerts: boolean;
  weekly_digest: boolean;
  security_alerts: boolean;
  created_at: string;
  updated_at: string;
}

export interface Agent {
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
}

export interface Task {
  id: string;
  workspace_id: string | null;
  title: string;
  description: string | null;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'paused';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_agent_id: string | null;
  progress: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface AgentEvent {
  id: string;
  agent_id: string;
  workspace_id: string | null;
  event_type: 'task_started' | 'task_completed' | 'status_change' | 'log' | 'error';
  message: string;
  payload: Json | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
      };
      workspaces: {
        Row: Workspace;
        Insert: Partial<Workspace> & { name: string; owner_id: string };
        Update: Partial<Workspace>;
      };
      workspace_members: {
        Row: WorkspaceMember;
        Insert: Partial<WorkspaceMember> & { workspace_id: string; user_id: string; role: WorkspaceMember['role'] };
        Update: Partial<WorkspaceMember>;
      };
      notification_preferences: {
        Row: NotificationPreferences;
        Insert: Partial<NotificationPreferences> & { user_id: string };
        Update: Partial<NotificationPreferences>;
      };
      agents: {
        Row: Agent;
        Insert: Partial<Agent> & { name: string; role: string };
        Update: Partial<Agent>;
      };
      tasks: {
        Row: Task;
        Insert: Partial<Task> & { title: string };
        Update: Partial<Task>;
      };
      agent_events: {
        Row: AgentEvent;
        Insert: Partial<AgentEvent> & { agent_id: string; event_type: AgentEvent['event_type']; message: string };
        Update: Partial<AgentEvent>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
