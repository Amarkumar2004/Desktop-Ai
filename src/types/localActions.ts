/**
 * Local Action & Desktop Integration Types
 * Server-safe, platform-safe abstractions for future Tauri v2 desktop app.
 * Shell / terminal access is strictly prohibited and excluded by design.
 */

export type LocalAccessCapability =
  | 'select_project_folder'
  | 'read_project_files'
  | 'write_project_files'
  | 'delete_project_files'
  | 'create_project_folders'
  | 'open_browser_url'
  | 'open_youtube_search'
  | 'show_desktop_notification'
  | 'prepare_message_draft'
  | 'send_approved_message';

export type CapabilityStatus = 'denied' | 'allowed' | 'requires_approval';

export type PlatformCapabilitiesMap = Record<LocalAccessCapability, CapabilityStatus>;

export type ActionRiskLevel = 'low' | 'medium' | 'high';

export interface LocalProjectFolder {
  id: string;
  name: string;
  scopedPath: string; // Sanitized relative or scoped virtual root path
  fileCount?: number;
  lastAccessedAt: string;
}

export interface LocalFileReadRequest {
  folderId: string;
  relativePath: string;
  maxBytes?: number;
}

export interface LocalFileWriteRequest {
  folderId: string;
  relativePath: string;
  content: string;
  approvalToken?: string;
}

export interface LocalFileDeleteRequest {
  folderId: string;
  relativePath: string;
  approvalToken?: string;
}

export interface LocalFolderCreateRequest {
  folderId: string;
  relativeFolderPath: string;
  approvalToken?: string;
}

export interface LocalFileChange {
  path: string;
  type: 'create' | 'modify' | 'delete';
  diffPreview?: string;
  content?: string;
}

export interface LocalBrowserOpenRequest {
  url: string;
  target: 'default_browser' | 'youtube_search';
  approvalToken?: string;
}

export interface LocalNotificationRequest {
  title: string;
  body: string;
  icon?: string;
}

export interface LocalMessagingRequest {
  recipient: string;
  platform: 'email' | 'slack' | 'discord' | 'webhook';
  subject?: string;
  messageContent: string;
  approvalToken?: string;
}

export interface LocalActionApproval {
  id: string;
  token: string;
  actionType: LocalAccessCapability;
  summary: string;
  scopedTarget: string;
  affectedFiles?: string[];
  diffSummary?: string;
  messagePreview?: {
    recipient: string;
    content: string;
  };
  riskLevel: ActionRiskLevel;
  createdAt: string;
  expiresAt: string; // Strict 5-minute TTL
  isConsumed: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface LocalActionAuditEvent {
  id: string;
  timestamp: string;
  actionType: LocalAccessCapability;
  status: 'success' | 'denied' | 'failed' | 'requires_approval';
  scopedTarget: string;
  riskLevel: ActionRiskLevel;
  approvalId?: string;
  details?: string;
}

export interface LocalActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: 'DESKTOP_APP_REQUIRED' | 'CAPABILITY_DENIED' | 'APPROVAL_REQUIRED' | 'APPROVAL_EXPIRED' | 'SECURITY_VIOLATION' | 'INVALID_PATH';
}

export interface ILocalActionService {
  getPlatformCapabilities(): Promise<PlatformCapabilitiesMap>;
  requestLocalActionApproval(
    actionType: LocalAccessCapability,
    scopedTarget: string,
    summary: string,
    riskLevel: ActionRiskLevel,
    extra?: {
      affectedFiles?: string[];
      diffSummary?: string;
      messagePreview?: { recipient: string; content: string };
    }
  ): Promise<LocalActionResult<LocalActionApproval>>;
  selectProjectFolder(): Promise<LocalActionResult<LocalProjectFolder>>;
  readProjectFiles(request: LocalFileReadRequest): Promise<LocalActionResult<{ content: string; bytesRead: number }>>;
  prepareProjectFileChanges(folderId: string, changes: LocalFileChange[]): Promise<LocalActionResult<LocalActionApproval>>;
  applyApprovedProjectFileChanges(approvalToken: string): Promise<LocalActionResult<{ appliedCount: number }>>;
  deleteProjectFiles(request: LocalFileDeleteRequest): Promise<LocalActionResult<{ deletedPath: string }>>;
  createProjectFolders(request: LocalFolderCreateRequest): Promise<LocalActionResult<{ createdFolderPath: string }>>;
  openBrowserUrl(request: LocalBrowserOpenRequest): Promise<LocalActionResult<{ url: string }>>;
  openYouTubeSearch(query: string): Promise<LocalActionResult<{ searchUrl: string }>>;
  showDesktopNotification(request: LocalNotificationRequest): Promise<LocalActionResult<void>>;
  prepareMessageDraft(request: LocalMessagingRequest): Promise<LocalActionResult<LocalActionApproval>>;
  sendApprovedMessage(approvalToken: string): Promise<LocalActionResult<{ messageId: string }>>;
}
