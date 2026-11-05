'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Building2,
  Bell,
  Shield,
  Palette,
  CreditCard,
  Check,
  Camera,
  Trash2,
  Laptop,
  Smartphone,
  KeyRound,
  Lock,
  LogOut,
  ExternalLink,
  ChevronRight,
  Sparkles,
  AlertCircle,
  HelpCircle,
  FileText,
  Plus,
  ArrowUpRight,
  ShieldAlert,
  Server,
  Zap,
  HardDrive,
  Users,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

import Card from '@/components/account/ui/Card';
import Input from '@/components/account/ui/Input';
import PasswordField from '@/components/account/ui/PasswordField';
import Button from '@/components/account/ui/Button';
import Toggle from '@/components/account/ui/Toggle';
import Badge from '@/components/account/ui/Badge';
import Alert from '@/components/account/ui/Alert';
import Tabs, { TabItem } from '@/components/account/ui/Tabs';
import UserDropdown from '@/components/account/UserDropdown';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';

import {
  INITIAL_USER_PROFILE,
  INITIAL_NOTIFICATION_PREFS,
  INITIAL_ACTIVE_SESSIONS,
  INITIAL_WORKSPACE_MEMBERS,
  INITIAL_BILLING_USAGE,
  INITIAL_INVOICES,
  UserProfile,
  NotificationPreferences,
  ActiveSession,
  WorkspaceMember,
  BillingUsage,
} from '@/data/mockAccountData';

export default function AccountSettingsPage() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const { success, info, error: toastError } = useToast();

  // Tab State
  const [activeTab, setActiveTab] = useState<string>('profile');

  // Profile Form State
  const [profile, setProfile] = useState<UserProfile>(() => ({
    ...INITIAL_USER_PROFILE,
    fullName: user?.fullName || '' ,
    email: user?.email || '' ,
    role: user?.role || '' ,
    avatarInitials: user?.avatarInitials || '' ,
  }));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  // Notification Preferences State
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(INITIAL_NOTIFICATION_PREFS);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // Security State
  const [activeSessions] = useState<ActiveSession[]>(INITIAL_ACTIVE_SESSIONS);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(1);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [sessionsRevoked, setSessionsRevoked] = useState(false);

  // Appearance State
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'system' | 'dark'>('light');
  const [compactDensity, setCompactDensity] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // Workspace State
  const [members] = useState<WorkspaceMember[]>(INITIAL_WORKSPACE_MEMBERS);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'Member' | 'Admin'>('Member');
  const [inviteSent, setInviteSent] = useState(false);

  // Billing State
  const [billing] = useState<BillingUsage>(INITIAL_BILLING_USAGE);
  const [showBillingSuccess, setShowBillingSuccess] = useState(false);

  // Navigation tab definitions
  const tabs: TabItem[] = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'workspace', label: 'Workspace', icon: <Building2 className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" /> },
  ];

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileSaved(false);
    try {
      const result = await updateProfile({
        fullName: profile.fullName,
        workspaceName: profile.workspaceName,
      });
      if (!result.success) {
        toastError('Profile not saved', result.error || 'The profile service did not confirm the update.');
        return;
      }
      setProfileSaved(true);
      success('Profile Updated', 'Your name and workspace name were saved to your authenticated account.');
    } catch (err) {
      toastError('Profile not saved', err instanceof Error ? err.message : 'The profile update failed.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Notifications Save
  const handleSaveNotifications = () => {
    setNotifSaved(false);
    toastError('Notification preferences unavailable', 'A persistent notification-preferences endpoint is not connected. No changes were saved.');
  };

  // Handle Password Update
  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    toastError('Password update unavailable', 'The authentication provider does not expose a password-update operation here. No password was changed.');
  };

  // Handle Revoke Sessions
  const handleSignOutOfAllDevices = () => {
    info('Session management unavailable', 'Connected session records are not currently provided by the authentication backend.');
  };

  // Handle Member Invite
  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    toastError('Invitations unavailable', 'Workspace invitation service is not connected. No invitation was sent.');
  };

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] text-stone-800 flex flex-col font-sans antialiased selection:bg-amber-200">
      {/* ========================================================================= */}
      {/* 1. TOP NAVBAR                                                             */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 h-16 w-full bg-white/80 backdrop-blur-md border-b border-stone-200/70 px-4 lg:px-8 flex items-center justify-between shadow-2xs">
        {/* Left: Logo and Breadcrumb */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-3 group select-none">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-500 shadow-sm text-white font-bold group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-white">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-stone-900 tracking-tight text-base">SUSI AI</span>
            </div>
          </Link>

          <div className="hidden sm:flex items-center gap-2 text-stone-400 text-xs">
            <span>/</span>
            <span className="font-semibold text-stone-700">Account Settings</span>
          </div>
        </div>

        {/* Right: Dashboard link + User Dropdown */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200/80 border border-stone-200 rounded-xl transition-colors"
          >
            <span>Dashboard</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
          </Link>

          <UserDropdown />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN ACCOUNT CONTENT AREA                                              */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Title & Breadcrumb Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-stone-200/60">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">Account Settings</h1>
            <p className="text-xs sm:text-sm text-stone-500">
              Manage your personal credentials, workspace preferences, and security.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="amber" dot>
              {profile.workspaceName}
            </Badge>
          </div>
        </div>

        {/* Mobile Horizontal Tabs Selector */}
        <div className="lg:hidden">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} orientation="horizontal" />
        </div>

        {/* Desktop Sidebar + Tab Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Navigation Sidebar */}
          <aside className="hidden lg:block lg:col-span-3 sticky top-24">
            <div className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs p-2">
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onChange={setActiveTab}
                orientation="vertical"
              />
            </div>

            {/* Quick Support / Docs Helper */}
            <div className="mt-4 p-4 bg-amber-50/60 border border-amber-200/60 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Need assistance?</span>
              </div>
              <p className="text-[11px] text-amber-800/80 leading-relaxed">
                Connect with our autonomous support agent or view API integration guides.
              </p>
              <a
                href="#"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 hover:text-amber-950 underline pt-1"
              >
                <span>Browse documentation</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </aside>

          {/* Right Main Content Tabs Panel */}
          <div className="lg:col-span-9 space-y-6">
            {/* =============================================================== */}
            {/* TAB 1: PROFILE TAB                                              */}
            {/* =============================================================== */}
            {activeTab === 'profile' && (
              <div className="space-y-6 pb-12 animate-in fade-in duration-200">
                {profileSaved && (
                  <Alert variant="success" title="Changes Saved!">
                    Your profile information has been updated successfully.
                  </Alert>
                )}

                {/* Profile Information Card */}
                <Card
                  title="Profile Information"
                  subtitle="Update your personal details and public operator profile."
                >
                  <form onSubmit={handleSaveProfile} className="space-y-6 select-text">
                    {/* Avatar Upload Section */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-stone-100">
                      <div className="relative w-16 h-16 rounded-full bg-amber-500 border-2 border-amber-300 flex items-center justify-center font-bold text-white text-xl shadow-xs shrink-0">
                        {avatarRemoved ? '?' : profile.avatarInitials}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-stone-900 text-white flex items-center justify-center shadow-xs">
                          <Camera className="w-3 h-3" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-stone-900">Profile Photo</h4>
                          <Badge variant="stone" size="sm">
                            JPG, PNG, WebP up to 4MB
                          </Badge>
                        </div>
                        <p className="text-[11px] text-stone-500">
                          This avatar represents you across agent dispatch notes and task approvals.
                        </p>
                        <div className="flex items-center gap-2 pt-1.5">
                          <button
                            type="button"
                            onClick={() => setAvatarRemoved(false)}
                            className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                          >
                            Change Avatar
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvatarRemoved(true)}
                            className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Inputs Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Full Name"
                        value={profile.fullName}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, fullName: e.target.value }))
                        }
                        required
                      />

                      <Input
                        label="Email Address"
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, email: e.target.value }))
                        }
                        helperText="Used for notifications & security sign-in."
                        required
                      />

                      <Input
                        label="Workspace Name"
                        value={profile.workspaceName}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, workspaceName: e.target.value }))
                        }
                        required
                      />

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-stone-700">Account Role</label>
                        <div className="flex items-center gap-2 pt-1">
                          <Badge variant="amber" size="md" dot>
                            {profile.role}
                          </Badge>
                          <span className="text-[11px] text-stone-400">
                            (Full administrative permissions)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Save Changes Row */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        isLoading={profileSaving}
                        leftIcon={profileSaved ? <Check className="w-4 h-4" /> : undefined}
                      >
                        {profileSaved ? 'Changes Saved!' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </Card>

                {/* Account Overview Card */}
                <Card
                  title="Account Overview"
                  subtitle="System details, subscription tier, and workspace identifier."
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs">
                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70">
                      <span className="text-[10.5px] font-bold text-stone-500 block uppercase tracking-wider">
                        Current Plan
                      </span>
                      <span className="font-bold text-stone-900 text-sm mt-0.5 block">
                        Starter
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Free Tier
                      </span>
                    </div>

                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70">
                      <span className="text-[10.5px] font-bold text-stone-500 block uppercase tracking-wider">
                        Workspace ID
                      </span>
                      <span className="font-mono font-bold text-stone-900 text-xs mt-1 block tracking-wide">
                        {profile.workspaceId}
                      </span>
                      <span className="text-[10px] text-stone-400 mt-0.5 block">Primary cluster</span>
                    </div>

                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70">
                      <span className="text-[10.5px] font-bold text-stone-500 block uppercase tracking-wider">
                        Member Since
                      </span>
                      <span className="font-bold text-stone-900 text-xs mt-1 block">
                        {profile.memberSince}
                      </span>
                      <span className="text-[10px] text-stone-400 mt-0.5 block">Verified account</span>
                    </div>

                    <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70">
                      <span className="text-[10.5px] font-bold text-stone-500 block uppercase tracking-wider">
                        Last Active
                      </span>
                      <span className="font-bold text-stone-900 text-xs mt-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        {profile.lastActive}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block">Online now</span>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 2: WORKSPACE TAB                                            */}
            {/* =============================================================== */}
            {activeTab === 'workspace' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Workspace Details */}
                <Card
                  title="Workspace Settings"
                  subtitle="Manage team members, roles, and workspace domain."
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Workspace Display Name"
                        value={profile.workspaceName}
                        onChange={(e) =>
                          setProfile((prev) => ({ ...prev, workspaceName: e.target.value }))
                        }
                      />

                      <Input
                        label="Workspace Slug & URL"
                        value="susi.ai/workspace/susi-dev-001"
                        readOnly
                        helperText="Public endpoint identifier for webhook triggers."
                      />
                    </div>
                  </div>
                </Card>

                {/* Team Members List */}
                <Card
                  title="Team Members"
                  subtitle="People with access to collaborate in this workspace."
                  headerAction={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowInviteModal(true)}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Invite Member
                    </Button>
                  }
                >
                  <div className="divide-y divide-stone-100">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="py-3.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-xs shadow-2xs shrink-0">
                            {member.avatarInitials}
                          </div>
                          <div>
                            <div className="font-bold text-stone-900 flex items-center gap-2">
                              <span>{member.name}</span>
                              {member.role === 'Owner' && (
                                <Badge variant="amber" size="sm">
                                  Owner
                                </Badge>
                              )}
                              {member.role === 'Admin' && (
                                <Badge variant="blue" size="sm">
                                  Admin
                                </Badge>
                              )}
                              {member.role === 'Member' && (
                                <Badge variant="stone" size="sm">
                                  Member
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-stone-500">{member.email}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="hidden sm:inline-block text-[11px] text-stone-400">
                            {member.joinedDate}
                          </span>
                          {member.role !== 'Owner' && (
                            <button
                              type="button"
                              onClick={() =>
                                setMembers((prev) => prev.filter((m) => m.id !== member.id))
                              }
                              className="p-1 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 3: NOTIFICATIONS TAB                                        */}
            {/* =============================================================== */}
            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {notifSaved && (
                  <Alert variant="success" title="Preferences Saved!">
                    Your notification delivery settings have been updated.
                  </Alert>
                )}

                <Card
                  title="Notification Preferences"
                  subtitle="Choose which automated agent events trigger email or in-app alerts."
                >
                  <div className="space-y-3">
                    <Toggle
                      checked={notifPrefs.taskAssigned}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, taskAssigned: val }))
                      }
                      label="Task Assigned"
                      description="Receive an immediate alert when an agent accepts a new queued task."
                    />

                    <Toggle
                      checked={notifPrefs.taskCompleted}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, taskCompleted: val }))
                      }
                      label="Task Completed"
                      description="Get notified when an autonomous task reaches 100% completion."
                    />

                    <Toggle
                      checked={notifPrefs.agentOffline}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, agentOffline: val }))
                      }
                      label="Agent Offline Alert"
                      description="Urgent dispatch warning if an agent becomes unresponsive or drops heartbeat."
                    />

                    <Toggle
                      checked={notifPrefs.agentErrors}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, agentErrors: val }))
                      }
                      label="Agent Execution Errors"
                      description="Critical notification on model timeouts, sandbox crashes, or syntax failures."
                    />

                    <Toggle
                      checked={notifPrefs.weeklyReport}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, weeklyReport: val }))
                      }
                      label="Weekly Telemetry Digest"
                      description="Summary report of fleet compute usage, task efficiency, and token counts."
                    />

                    <Toggle
                      checked={notifPrefs.productUpdates}
                      onChange={(val) =>
                        setNotifPrefs((prev) => ({ ...prev, productUpdates: val }))
                      }
                      label="SUSI AI Product Updates"
                      description="Early access notifications for new agent models and orchestration features."
                    />
                  </div>

                  <div className="flex items-center justify-end pt-5 border-t border-stone-100 mt-5">
                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      isLoading={notifSaving}
                      onClick={handleSaveNotifications}
                      leftIcon={notifSaved ? <Check className="w-4 h-4" /> : undefined}
                    >
                      {notifSaved ? 'Preferences Saved!' : 'Save Preferences'}
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 4: SECURITY TAB                                             */}
            {/* =============================================================== */}
            {activeTab === 'security' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {sessionsRevoked && (
                  <Alert variant="success" title="Devices Signed Out">
                    All other active sessions have been terminated.
                  </Alert>
                )}

                {/* Password & Authentication */}
                <Card
                  title="Password & Authentication"
                  subtitle="Keep your workspace credentials secure with regular rotation."
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-stone-50/80 border border-stone-200/70 rounded-xl">
                    <div className="space-y-0.5">
                      <div className="font-bold text-xs text-stone-900 flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        <span>Account Password</span>
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Last changed 30 days ago. Strong alphanumeric requirements enforced.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPasswordModal(true)}
                    >
                      Change Password
                    </Button>
                  </div>
                </Card>

                {/* Two-Factor Authentication (2FA) */}
                <Card
                  title="Two-Factor Authentication (2FA)"
                  subtitle="Add an extra layer of protection to your autonomous workspace."
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-stone-50/80 border border-stone-200/70 rounded-xl">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-stone-900">
                          Authenticator App (TOTP)
                        </span>
                        {twoFactorEnabled ? (
                          <Badge variant="emerald" size="sm" dot>
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="stone" size="sm">
                            Status unavailable
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-stone-500">
                        Use Google Authenticator, 1Password, or Authy to generate secure verification codes.
                      </p>
                    </div>

                    <Button
                      variant={twoFactorEnabled ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => toastError('2FA unavailable', 'A real TOTP enrollment and verification backend is not connected. Two-factor authentication was not enabled.')}
                    >
                      {twoFactorEnabled ? 'Manage 2FA' : 'Set up 2FA'}
                    </Button>
                  </div>
                </Card>

                {/* Active Sessions */}
                <Card
                  title="Active Sessions"
                  subtitle="Devices and browsers currently authenticated with your account."
                >
                  <div className="space-y-3">
                    {activeSessions.map((session) => (
                      <div
                        key={session.id}
                        className="p-3.5 bg-stone-50/70 border border-stone-200/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-600 shadow-2xs shrink-0 mt-0.5">
                            {session.iconType === 'desktop' ? (
                              <Laptop className="w-4 h-4" />
                            ) : (
                              <Smartphone className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-stone-900">{session.device}</span>
                              <span className="text-stone-400">•</span>
                              <span className="text-stone-600 font-medium">{session.browser}</span>
                              {session.isCurrent && (
                                <Badge variant="emerald" size="sm" dot>
                                  Current session
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                              <span>{session.location}</span>
                              <span>•</span>
                              <span>IP: {session.ipAddress}</span>
                              <span>•</span>
                              <span>{session.lastActive}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sign out of all devices button */}
                  <div className="pt-4 border-t border-stone-100 mt-4 flex items-center justify-between">
                    <p className="text-[11px] text-stone-500">
                      Lost a device or suspect unauthorized access?
                    </p>
                    <Button
                      variant="danger-outline"
                      size="sm"
                      onClick={handleSignOutOfAllDevices}
                      leftIcon={<LogOut className="w-3.5 h-3.5" />}
                    >
                      Sign out of all devices
                    </Button>
                  </div>
                </Card>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 5: APPEARANCE TAB                                           */}
            {/* =============================================================== */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <Card
                  title="Theme & Display Preferences"
                  subtitle="Customize the appearance of the SUSI AI dashboard."
                >
                  <div className="space-y-6">
                    {/* Theme Selector Grid */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-800 block">
                        Interface Theme
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Light Theme */}
                        <div
                          onClick={() => setSelectedTheme('light')}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            selectedTheme === 'light'
                              ? 'border-amber-500 bg-amber-50/40 shadow-xs'
                              : 'border-stone-200 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="h-16 rounded-xl bg-[#FDFBF7] border border-stone-200 p-2 flex flex-col justify-between mb-2">
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="w-6 h-1.5 rounded-full bg-stone-300" />
                            </div>
                            <div className="space-y-1">
                              <div className="w-full h-2 rounded bg-white border border-stone-200" />
                              <div className="w-3/4 h-2 rounded bg-stone-100" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                            <div className="flex items-center gap-1.5">
                              <Sun className="w-3.5 h-3.5 text-amber-500" />
                              <span>Light (Default)</span>
                            </div>
                            {selectedTheme === 'light' && (
                              <Check className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                        </div>

                        {/* System Theme */}
                        <div
                          onClick={() => setSelectedTheme('system')}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            selectedTheme === 'system'
                              ? 'border-amber-500 bg-amber-50/40 shadow-xs'
                              : 'border-stone-200 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="h-16 rounded-xl bg-gradient-to-r from-[#FDFBF7] to-stone-900 border border-stone-200 p-2 flex flex-col justify-between mb-2">
                            <div className="flex items-center justify-between">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="w-2 h-2 rounded-full bg-stone-400" />
                            </div>
                            <div className="w-full h-2 rounded bg-stone-300/40" />
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                            <div className="flex items-center gap-1.5">
                              <Monitor className="w-3.5 h-3.5 text-stone-500" />
                              <span>System</span>
                            </div>
                            {selectedTheme === 'system' && (
                              <Check className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                        </div>

                        {/* Dark Theme */}
                        <div
                          onClick={() => setSelectedTheme('dark')}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            selectedTheme === 'dark'
                              ? 'border-amber-500 bg-amber-50/40 shadow-xs'
                              : 'border-stone-200 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="h-16 rounded-xl bg-stone-900 border border-stone-800 p-2 flex flex-col justify-between mb-2">
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="w-6 h-1.5 rounded-full bg-stone-700" />
                            </div>
                            <div className="space-y-1">
                              <div className="w-full h-2 rounded bg-stone-800" />
                              <div className="w-3/4 h-2 rounded bg-stone-800/60" />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                            <div className="flex items-center gap-1.5">
                              <Moon className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Dark</span>
                            </div>
                            {selectedTheme === 'dark' && (
                              <Check className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Display Density Toggles UI */}
                    <div className="space-y-3 pt-2">
                      <Toggle
                        checked={compactDensity}
                        onChange={setCompactDensity}
                        label="Compact SaaS Density"
                        description="Reduce table and card padding to fit more telemetry metrics on screen."
                      />

                      <Toggle
                        checked={highContrast}
                        onChange={setHighContrast}
                        label="High Contrast Accents"
                        description="Increase border emphasis and badge contrast for improved visibility."
                      />
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* =============================================================== */}
            {/* TAB 6: BILLING TAB                                              */}
            {/* =============================================================== */}
            {activeTab === 'billing' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {showBillingSuccess && (
                  <Alert variant="success" title="Subscription Updated">
                    Your workspace plan features have been refreshed.
                  </Alert>
                )}

                {/* Plan Card */}
                <Card
                  title="Current Subscription"
                  subtitle="View your workforce tier and compute capacity limits."
                  headerAction={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => toastError('Billing unavailable', 'No billing provider or subscription management endpoint is connected.')}
                    >
                      Manage Subscription
                    </Button>
                  }
                >
                  <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-stone-900">
                          {billing.plan} Plan
                        </h3>
                        <Badge variant="stone" size="sm">
                          Billing unavailable
                        </Badge>
                      </div>
                      <p className="text-xs text-stone-600">
                        Subscription limits are unavailable until a billing provider is connected.
                      </p>
                    </div>

                    <div className="text-left sm:text-right shrink-0">
                      <div className="text-2xl font-black text-stone-900">—</div>
                      <span className="text-[11px] text-stone-500">No billing data</span>
                    </div>
                  </div>
                </Card>

                {/* Usage Cards Grid */}
                <Card
                  title="Workspace Usage & Limits"
                  subtitle="Track compute consumption against your monthly plan quotas."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    {/* Active Agents Usage */}
                    <div className="p-4 bg-stone-50/80 rounded-2xl border border-stone-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-amber-600" /> Active Agents
                        </span>
                        <span className="font-bold text-stone-900">
                          Unavailable
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all"
                          style={{
                            width: '0%',
                          }}
                        />
                      </div>
                      <span className="text-[10.5px] text-stone-500 block">
                        Usage data unavailable
                      </span>
                    </div>

                    {/* Monthly Tasks Usage */}
                    <div className="p-4 bg-stone-50/80 rounded-2xl border border-stone-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800 flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-blue-600" /> Monthly Tasks
                        </span>
                        <span className="font-bold text-stone-900">
                          Unavailable
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all"
                          style={{
                            width: '0%',
                          }}
                        />
                      </div>
                      <span className="text-[10.5px] text-stone-500 block">
                        Usage data unavailable
                      </span>
                    </div>

                    {/* Storage Usage */}
                    <div className="p-4 bg-stone-50/80 rounded-2xl border border-stone-200/70 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800 flex items-center gap-1.5">
                          <HardDrive className="w-4 h-4 text-emerald-600" /> Vector Storage
                        </span>
                        <span className="font-bold text-stone-900">
                          Unavailable
                        </span>
                      </div>
                      <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all"
                          style={{
                            width: '0%',
                          }}
                        />
                      </div>
                      <span className="text-[10.5px] text-stone-500 block">
                        Usage data unavailable
                      </span>
                    </div>
                  </div>
                </Card>

                {/* Invoice History Empty State UI */}
                <Card
                  title="Billing History & Invoices"
                  subtitle="Download receipts and past workspace transactions."
                >
                  <div className="py-8 px-4 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 mx-auto shadow-2xs">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm mx-auto">
                      <h4 className="text-xs font-bold text-stone-800">No invoices found</h4>
                      <p className="text-[11px] text-stone-500">
                        Your workspace is currently on the free Starter plan. Invoices and receipts
                        will appear here once you upgrade.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 3. MODALS (Change Password, 2FA, Invite Member)                           */}
      {/* ========================================================================= */}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Change Password</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            </div>

            {passwordSuccess ? (
              <Alert variant="success" title="Password Updated">
                Your password has been changed successfully.
              </Alert>
            ) : (
              <form onSubmit={handleUpdatePassword} className="space-y-3">
                <PasswordField
                  label="Current Password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={passwordUpdating}
                  required
                />
                <PasswordField
                  label="New Password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={passwordUpdating}
                  showStrength
                  required
                />
                <PasswordField
                  label="Confirm New Password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={passwordUpdating}
                  required
                />
                <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPasswordModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={passwordUpdating}
                  >
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 2FA Setup Modal */}
      {showTwoFactorModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
                <Shield className="w-4 h-4 text-amber-600" />
                <span>Two-Factor Authentication</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTwoFactorModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            </div>

            {twoFactorEnabled ? (
              <div className="space-y-4 text-xs">
                <Alert variant="success" title="2FA is Active">
                  Your account is protected by time-based one-time passwords (TOTP).
                </Alert>
                <Button
                  variant="danger-outline"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setTwoFactorEnabled(false);
                    setShowTwoFactorModal(false);
                  }}
                >
                  Disable Two-Factor Authentication
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <p className="text-stone-600">
                  Scan this QR code with your authenticator app (e.g. Google Authenticator) and enter
                  the 6-digit verification code below.
                </p>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">Two-factor authentication setup is unavailable because no TOTP enrollment backend is connected. No QR code or verification secret has been generated.</div>

                <Input
                  disabled
                  label="Verification Code"
                  placeholder="000 000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  maxLength={6}
                />

                <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTwoFactorModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" variant="primary" size="sm" disabled>
                    2FA enrollment unavailable
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 font-bold text-stone-900 text-sm">
                <Users className="w-4 h-4 text-amber-600" />
                <span>Invite Workspace Member</span>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            </div>

            {inviteSent ? (
              <Alert variant="success" title="Invitation Dispatched">
                An invitation email has been sent to {inviteEmail}.
              </Alert>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-4 text-xs">
                <Input
                  label="Collaborator Email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />

                <div className="space-y-1.5">
                  <label className="font-semibold text-stone-700 block">Workspace Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteRole('Member')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        inviteRole === 'Member'
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                          : 'border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      <div className="text-xs">Member</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        Can dispatch & monitor tasks
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInviteRole('Admin')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        inviteRole === 'Admin'
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                          : 'border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      <div className="text-xs">Admin</div>
                      <div className="text-[10px] text-stone-500 font-normal">
                        Full agent & billing control
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInviteModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm">
                    Send Invitation
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
