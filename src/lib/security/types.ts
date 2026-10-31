/**
 * Security & Permission System Types
 * 3-Tier Risk Hierarchy, Multi-modal approval (GUI, Voice, Chat), and Audit Logging.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';

export type PermissionChannel = 'GUI' | 'VOICE' | 'CHAT' | 'AUTO';

export interface ActionMetadata {
  filename?: string;
  fileSize?: string;
  fileSizeBytes?: number;
  exists?: boolean;
  command?: string;
  diffSummary?: string;
  sourceDir?: string;
  destinationDir?: string;
  [key: string]: unknown;
}

export interface PermissionRequest {
  id: string;
  actionType: string;
  target: string;
  component: string;
  reason: string;
  riskLevel: RiskLevel;
  isReversible: boolean;
  consequences: string;
  metadata?: ActionMetadata;
  status: ApprovalStatus;
  approvedByChannel?: PermissionChannel;
  createdAt: number;
  expiresAt: number; // Defaults to 45 seconds TTL
  resolvedAt?: number;
  voicePromptHi?: string;
  voicePromptEn?: string;
}

export interface ActionClassificationResult {
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  isReversible: boolean;
  consequences: string;
  component: string;
  reason: string;
  voicePromptHi: string;
  voicePromptEn: string;
  isBlocked?: boolean;
  blockedReason?: string;
}

export interface AuditLogEntry {
  id: string;
  requestId: string;
  timestamp: string;
  actionType: string;
  target: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  channel?: PermissionChannel;
  executionResult?: {
    success: boolean;
    message: string;
    error?: string;
  };
}
