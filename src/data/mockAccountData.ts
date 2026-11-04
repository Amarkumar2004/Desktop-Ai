export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  workspaceName: string;
  workspaceId: string;
  role: string;
  avatarInitials: string;
  avatarUrl?: string;
  memberSince: string;
  lastActive: string;
  location: string;
  timezone: string;
}

export interface NotificationPreferences {
  taskAssigned: boolean;
  taskCompleted: boolean;
  agentOffline: boolean;
  agentErrors: boolean;
  weeklyReport: boolean;
  productUpdates: boolean;
}

export interface ActiveSession {
  id: string;
  device: string;
  browser: string;
  location: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
  iconType: 'desktop' | 'mobile';
}

export interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Member';
  avatarInitials: string;
  status: 'Active' | 'Pending';
  joinedDate: string;
}

export interface BillingUsage {
  plan: string;
  price: string;
  billingPeriod: string;
  renewalDate: string;
  activeAgentsUsed: number;
  activeAgentsMax: number;
  monthlyTasksUsed: number;
  monthlyTasksMax: number;
  storageUsedGB: number;
  storageMaxGB: number;
}

export interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'Paid' | 'Pending' | 'Draft';
  pdfUrl?: string;
}

export const INITIAL_USER_PROFILE: UserProfile = {
  id: '', fullName: '', email: '', workspaceName: '', workspaceId: '', role: '', avatarInitials: '',
  memberSince: '', lastActive: '', location: '', timezone: '',
};

export const INITIAL_NOTIFICATION_PREFS: NotificationPreferences = {
  taskAssigned: true,
  taskCompleted: true,
  agentOffline: true,
  agentErrors: true,
  weeklyReport: false,
  productUpdates: true,
};

export const INITIAL_ACTIVE_SESSIONS: ActiveSession[] = [];

export const INITIAL_WORKSPACE_MEMBERS: WorkspaceMember[] = [];

export const INITIAL_BILLING_USAGE: BillingUsage = {
  plan: 'Not Connected', price: '—', billingPeriod: 'Unavailable', renewalDate: '—',
  activeAgentsUsed: 0, activeAgentsMax: 0, monthlyTasksUsed: 0, monthlyTasksMax: 0,
  storageUsedGB: 0, storageMaxGB: 0,
};

export const INITIAL_INVOICES: Invoice[] = [];
