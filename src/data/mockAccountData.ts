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
  id: 'usr-92841',
  fullName: 'Alex Rivera',
  email: 'alex.rivera@susi.ai',
  workspaceName: 'SUSI Autonomous Swarm',
  workspaceId: 'SUSI-DEV-001',
  role: 'Workspace Owner',
  avatarInitials: 'AR',
  memberSince: 'January 2026',
  lastActive: 'Just now',
  location: 'San Francisco, CA',
  timezone: 'PST (UTC-8)',
};

export const INITIAL_NOTIFICATION_PREFS: NotificationPreferences = {
  taskAssigned: true,
  taskCompleted: true,
  agentOffline: true,
  agentErrors: true,
  weeklyReport: false,
  productUpdates: true,
};

export const INITIAL_ACTIVE_SESSIONS: ActiveSession[] = [
  {
    id: 'sess-1',
    device: 'MacBook Pro 16"',
    browser: 'Chrome 128.0 (macOS)',
    location: 'San Francisco, United States',
    ipAddress: '198.51.100.24',
    lastActive: 'Active now',
    isCurrent: true,
    iconType: 'desktop',
  },
  {
    id: 'sess-2',
    device: 'iPhone 15 Pro',
    browser: 'Safari Mobile (iOS 18.1)',
    location: 'Cupertino, United States',
    ipAddress: '198.51.100.89',
    lastActive: '2 hours ago',
    isCurrent: false,
    iconType: 'mobile',
  },
  {
    id: 'sess-3',
    device: 'Workstation PC',
    browser: 'Firefox 130.0 (Windows 11)',
    location: 'Austin, United States',
    ipAddress: '203.0.113.19',
    lastActive: '3 days ago',
    isCurrent: false,
    iconType: 'desktop',
  },
];

export const INITIAL_WORKSPACE_MEMBERS: WorkspaceMember[] = [
  {
    id: 'mem-1',
    name: 'Alex Rivera',
    email: 'alex.rivera@susi.ai',
    role: 'Owner',
    avatarInitials: 'AR',
    status: 'Active',
    joinedDate: 'Jan 2026',
  },
  {
    id: 'mem-2',
    name: 'Sarah Chen',
    email: 'sarah.c@susi.ai',
    role: 'Admin',
    avatarInitials: 'SC',
    status: 'Active',
    joinedDate: 'Feb 2026',
  },
  {
    id: 'mem-3',
    name: 'David Kim',
    email: 'david.k@susi.ai',
    role: 'Member',
    avatarInitials: 'DK',
    status: 'Active',
    joinedDate: 'Mar 2026',
  },
];

export const INITIAL_BILLING_USAGE: BillingUsage = {
  plan: 'Starter',
  price: '$0',
  billingPeriod: 'Free forever',
  renewalDate: 'April 1, 2026',
  activeAgentsUsed: 4,
  activeAgentsMax: 5,
  monthlyTasksUsed: 1420,
  monthlyTasksMax: 5000,
  storageUsedGB: 1.42,
  storageMaxGB: 5.0,
};

export const INITIAL_INVOICES: Invoice[] = [];
