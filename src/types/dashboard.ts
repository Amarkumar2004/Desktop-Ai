export type AgentId = 'lex' | 'susi' | 'spy' | 'euro' | 'yoru';
export type AgentStatus = 'Online' | 'Busy' | 'Idle' | 'Offline';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical' | 'Routine';
export type TaskStatus = 'Active' | 'Scheduled' | 'Completed';
export type RoomId = 'research-lab' | 'data-center' | 'strategy-room' | 'creative-studio' | 'core-plaza';

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  title: string;
  status: AgentStatus;
  color: string;
  accentColor: string;
  bgLight: string;
  borderLight: string;
  textColor: string;
  avatarSeed: string;
  room: RoomId;
  specialty: string;
  efficiency: number;
  memoryUsage: string;
  taskCount: number;
  currentTask: string;
  level: number;
  coordinates: { x: number; y: number };
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedAgent: AgentId;
  progress: number;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  createdAt: string;
  eta: string;
  iconName: string;
}

export interface TaskItem {
  id: string;
  title: string;
  assignedAgent: 'LEX' | 'SUSI' | 'SPY' | 'EURO' | 'YORU';
  progress: number;
  priority: 'High' | 'Critical' | 'Medium' | 'Low';
  category: string;
  completed?: boolean;
  userId?: string | null;
}

export interface NewsItem {
  id: string;
  message: string;
  timestamp: string;
  type: 'deploy' | 'agent' | 'security' | 'backup' | 'system' | 'task';
  tag: string;
  color: string;
}

export interface ConsoleEntry {
  id: string;
  text: string;
  type: 'system' | 'module' | 'agent' | 'success' | 'json' | 'input' | 'output' | 'error';
  timestamp: string;
}

export interface SystemMetrics {
  uptime: string;
  cpuPercent: number;
  cpuHistory: number[];
  memoryPercent: number;
  memoryHistory: number[];
  networkStatus: string;
  networkHistory: number[];
  storageUsedTB: number;
  storageTotalTB: number;
  onlineCount: number;
  busyCount: number;
  idleCount: number;
  offlineCount: number;
  totalAgents: number;
  throughputMops: number;
  syncRate: number;
  coreTempC: number;
}

export interface RoomDetails {
  id: RoomId;
  name: string;
  code: string;
  themeColor: string;
  bgClass: string;
  borderClass: string;
  assignedAgentId: AgentId;
  description: string;
  stats: { label: string; value: string }[];
  activeProcesses: string[];
  capacity: number;
  ambientTemp: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'alert' | 'update' | 'task';
}
