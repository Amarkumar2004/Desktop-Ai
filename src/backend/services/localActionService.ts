/**
 * Local Action Service
 * Platform abstraction layer for desktop PC actions.
 * In the current web environment, all local actions return "Desktop app required"
 * and enforce a strict default-deny capability policy without shell access.
 */

import type {
  ILocalActionService,
  LocalAccessCapability,
  PlatformCapabilitiesMap,
  LocalProjectFolder,
  LocalFileReadRequest,
  LocalFileWriteRequest,
  LocalFileDeleteRequest,
  LocalFolderCreateRequest,
  LocalFileChange,
  LocalBrowserOpenRequest,
  LocalNotificationRequest,
  LocalMessagingRequest,
  LocalActionApproval,
  LocalActionResult,
  ActionRiskLevel,
} from '@/types/localActions';
import { validateScopedRelativePath, validateBrowserUrl } from '../validation/localPathSecurity';

// In-memory store for short-lived, single-use approvals (5-minute TTL)
const APPROVAL_TTL_MS = 5 * 60 * 1000;
const approvalStore = new Map<string, LocalActionApproval>();

export class LocalActionService implements ILocalActionService {
  /**
   * Returns current platform capabilities.
   * In web mode, every capability defaults to denied.
   */
  public async getPlatformCapabilities(): Promise<PlatformCapabilitiesMap> {
    return {
      select_project_folder: 'denied',
      read_project_files: 'denied',
      write_project_files: 'denied',
      delete_project_files: 'denied',
      create_project_folders: 'denied',
      open_browser_url: 'denied',
      open_youtube_search: 'denied',
      show_desktop_notification: 'denied',
      prepare_message_draft: 'denied',
      send_approved_message: 'denied',
    };
  }

  /**
   * Generates a 5-minute single-use approval request token for sensitive actions.
   */
  public async requestLocalActionApproval(
    actionType: LocalAccessCapability,
    scopedTarget: string,
    summary: string,
    riskLevel: ActionRiskLevel,
    extra?: {
      affectedFiles?: string[];
      diffSummary?: string;
      messagePreview?: { recipient: string; content: string };
    }
  ): Promise<LocalActionResult<LocalActionApproval>> {
    const now = new Date();
    const expires = new Date(now.getTime() + APPROVAL_TTL_MS);

    const token = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const approval: LocalActionApproval = {
      id: `act-appr-${Date.now()}`,
      token,
      actionType,
      summary,
      scopedTarget,
      affectedFiles: extra?.affectedFiles,
      diffSummary: extra?.diffSummary,
      messagePreview: extra?.messagePreview,
      riskLevel,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      isConsumed: false,
      status: 'pending',
    };

    approvalStore.set(token, approval);

    return {
      success: true,
      data: approval,
    };
  }

  /**
   * Internal validator to verify and consume a single-use approval token.
   */
  public validateAndConsumeApproval(
    token: string,
    expectedAction: LocalAccessCapability
  ): { valid: boolean; error?: string; approval?: LocalActionApproval } {
    if (!token) {
      return { valid: false, error: 'Approval token is required.' };
    }

    const approval = approvalStore.get(token);
    if (!approval) {
      return { valid: false, error: 'Invalid or non-existent approval token.' };
    }

    if (approval.isConsumed) {
      return { valid: false, error: 'Approval token has already been consumed.' };
    }

    const now = Date.now();
    if (new Date(approval.expiresAt).getTime() < now) {
      approval.status = 'expired';
      return { valid: false, error: 'Approval token has expired (5-minute limit exceeded).' };
    }

    if (approval.actionType !== expectedAction) {
      return { valid: false, error: `Approval token action mismatch: expected ${expectedAction}.` };
    }

    // Mark single-use token as consumed
    approval.isConsumed = true;
    approval.status = 'approved';

    return { valid: true, approval };
  }

  // =========================================================================
  // LOCAL ACTIONS (Web Fallbacks: Desktop App Required)
  // =========================================================================

  public async selectProjectFolder(): Promise<LocalActionResult<LocalProjectFolder>> {
    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async readProjectFiles(
    request: LocalFileReadRequest
  ): Promise<LocalActionResult<{ content: string; bytesRead: number }>> {
    const pathCheck = validateScopedRelativePath(request.relativePath);
    if (!pathCheck.isValid) {
      return {
        success: false,
        error: pathCheck.rejectionReason,
        code: 'SECURITY_VIOLATION',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async prepareProjectFileChanges(
    folderId: string,
    changes: LocalFileChange[]
  ): Promise<LocalActionResult<LocalActionApproval>> {
    // Validate each proposed path before generating approval draft
    for (const change of changes) {
      const pathCheck = validateScopedRelativePath(change.path);
      if (!pathCheck.isValid) {
        return {
          success: false,
          error: `Invalid file path "${change.path}": ${pathCheck.rejectionReason}`,
          code: 'SECURITY_VIOLATION',
        };
      }
    }

    return this.requestLocalActionApproval(
      'write_project_files',
      folderId,
      `Prepare ${changes.length} file change(s) in scoped folder`,
      changes.some((c) => c.type === 'delete') ? 'high' : 'medium',
      {
        affectedFiles: changes.map((c) => c.path),
        diffSummary: `Proposed ${changes.length} change(s)`,
      }
    );
  }

  public async applyApprovedProjectFileChanges(
    approvalToken: string
  ): Promise<LocalActionResult<{ appliedCount: number }>> {
    const verification = this.validateAndConsumeApproval(approvalToken, 'write_project_files');
    if (!verification.valid) {
      return {
        success: false,
        error: verification.error,
        code: 'APPROVAL_EXPIRED',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async deleteProjectFiles(
    request: LocalFileDeleteRequest
  ): Promise<LocalActionResult<{ deletedPath: string }>> {
    const pathCheck = validateScopedRelativePath(request.relativePath);
    if (!pathCheck.isValid) {
      return {
        success: false,
        error: pathCheck.rejectionReason,
        code: 'SECURITY_VIOLATION',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async createProjectFolders(
    request: LocalFolderCreateRequest
  ): Promise<LocalActionResult<{ createdFolderPath: string }>> {
    const pathCheck = validateScopedRelativePath(request.relativeFolderPath);
    if (!pathCheck.isValid) {
      return {
        success: false,
        error: pathCheck.rejectionReason,
        code: 'SECURITY_VIOLATION',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async openBrowserUrl(
    request: LocalBrowserOpenRequest
  ): Promise<LocalActionResult<{ url: string }>> {
    const urlCheck = validateBrowserUrl(request.url);
    if (!urlCheck.isValid) {
      return {
        success: false,
        error: urlCheck.error,
        code: 'SECURITY_VIOLATION',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async openYouTubeSearch(
    query: string
  ): Promise<LocalActionResult<{ searchUrl: string }>> {
    if (!query || typeof query !== 'string') {
      return {
        success: false,
        error: 'Search query cannot be empty.',
        code: 'INVALID_PATH',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async showDesktopNotification(
    _request: LocalNotificationRequest
  ): Promise<LocalActionResult<void>> {
    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }

  public async prepareMessageDraft(
    request: LocalMessagingRequest
  ): Promise<LocalActionResult<LocalActionApproval>> {
    if (!request.recipient || !request.messageContent) {
      return {
        success: false,
        error: 'Recipient and message content are required.',
        code: 'INVALID_PATH',
      };
    }

    return this.requestLocalActionApproval(
      'prepare_message_draft',
      request.recipient,
      `Draft ${request.platform} message to ${request.recipient}`,
      'medium',
      {
        messagePreview: {
          recipient: request.recipient,
          content: request.messageContent,
        },
      }
    );
  }

  public async sendApprovedMessage(
    approvalToken: string
  ): Promise<LocalActionResult<{ messageId: string }>> {
    const verification = this.validateAndConsumeApproval(approvalToken, 'send_approved_message');
    if (!verification.valid) {
      return {
        success: false,
        error: verification.error,
        code: 'APPROVAL_EXPIRED',
      };
    }

    return {
      success: false,
      error: 'Desktop app required',
      code: 'DESKTOP_APP_REQUIRED',
    };
  }
}

// Global Singleton Instance
export const localActionService = new LocalActionService();
