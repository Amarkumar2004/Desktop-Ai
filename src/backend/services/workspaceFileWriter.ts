/**
 * SUSI AI — Restricted Workspace File Writer for LEX
 *
 * Enforces strict workspace boundary constraints, realpath & symlink traversal protection,
 * mandatory user-identity-bound approval gates for existing files, atomic staging writes,
 * and immediate read-back verification.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export interface FileWriteResult {
  path: string;
  relativePath: string;
  success: boolean;
  verified: boolean;
  bytesWritten: number;
  operation: 'created' | 'modified' | 'rejected' | 'failed';
  error?: string;
}

export interface TrustedOverwriteApproval {
  approvalId: string;
  userId: string; // Mandatory explicit user identity
  taskId: string; // Mandatory bound task ID
  filePath: string;
  operation: 'OVERWRITE';
  issuedAt: number;
  expiresAt: number;
  confirmationToken: string;
}

export interface WorkspaceWriteOptions {
  workspaceRoot?: string;
  taskId?: string;
  userId?: string | null;
  trustedApproval?: TrustedOverwriteApproval;
}

const FORBIDDEN_FILENAMES_OR_PREFIXES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.git',
  '.ssh',
  'node_modules',
  'package-lock.json',
  'id_rsa',
  'id_ed25519',
  'credential',
  'providerVault.ts',
  'desktopAuth.ts',
];

export class WorkspaceFileWriter {
  private readonly defaultWorkspaceRoot: string;
  private activeApprovals = new Map<string, TrustedOverwriteApproval>();

  constructor(customWorkspaceRoot?: string) {
    this.defaultWorkspaceRoot = path.resolve(customWorkspaceRoot || process.cwd());
  }

  /**
   * Issues an overwrite approval ONLY upon explicit, verified user confirmation.
   * Arbitrary task context or model output cannot invoke this without explicit proof.
   */
  public issueExplicitUserConfirmationApproval(params: {
    taskId: string;
    filePath: string;
    userId: string;
    explicitUserConfirmed: boolean;
    ttlMs?: number;
  }): TrustedOverwriteApproval {
    const { taskId, filePath, userId, explicitUserConfirmed, ttlMs = 5 * 60 * 1000 } = params;

    if (!explicitUserConfirmed) {
      throw new Error('Security violation: Explicit user confirmation is strictly required to issue an overwrite approval.');
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('Security violation: User identity is mandatory to issue an overwrite approval.');
    }
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      throw new Error('Security violation: Task ID is mandatory to issue an overwrite approval.');
    }
    if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
      throw new Error('Security violation: File path is mandatory to issue an overwrite approval.');
    }

    const now = Date.now();
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const approvalId = `appr_${crypto.randomBytes(16).toString('hex')}`;
    const confirmationToken = `conf_${crypto.randomBytes(16).toString('hex')}`;

    const approval: TrustedOverwriteApproval = {
      approvalId,
      userId: userId.trim(),
      taskId: taskId.trim(),
      filePath: cleanPath,
      operation: 'OVERWRITE',
      issuedAt: now,
      expiresAt: now + ttlMs,
      confirmationToken,
    };

    this.activeApprovals.set(approvalId, approval);
    return approval;
  }

  /**
   * Validates and immediately consumes an approval token (single-use nonce consumption).
   * Rejects if recorded user identity or execution user identity is missing or mismatched.
   */
  public validateAndConsumeApproval(
    approval: TrustedOverwriteApproval,
    target: { taskId: string; cleanRelativePath: string; userId?: string | null }
  ): { valid: boolean; error?: string } {
    if (!approval || typeof approval !== 'object' || !approval.approvalId) {
      return { valid: false, error: 'Approval token is missing or malformed.' };
    }

    // 1. Mandatory Identity Check: both recorded userId and execution userId must be non-empty strings
    if (!approval.userId || typeof approval.userId !== 'string' || !approval.userId.trim()) {
      return { valid: false, error: 'Security violation: Approval recorded user identity is missing or empty.' };
    }
    if (!target.userId || typeof target.userId !== 'string' || !target.userId.trim()) {
      return { valid: false, error: 'Security violation: Execution user identity is missing or empty.' };
    }
    if (approval.userId.trim() !== target.userId.trim()) {
      return {
        valid: false,
        error: `Security violation: Approval token user mismatch. Approved by "${approval.userId}", executed by "${target.userId}".`,
      };
    }

    // 2. Lookup in active unconsumed approvals (prevents forgery and replay)
    const recorded = this.activeApprovals.get(approval.approvalId);
    if (!recorded) {
      return { valid: false, error: 'Security violation: Approval token is invalid, unrecognized, or has already been consumed.' };
    }

    // Single-use: remove immediately
    this.activeApprovals.delete(approval.approvalId);

    // 3. Expiration check
    if (Date.now() > recorded.expiresAt) {
      return { valid: false, error: 'Security violation: Approval token has expired.' };
    }

    // 4. Exact task ID check
    if (!target.taskId || recorded.taskId !== target.taskId.trim()) {
      return {
        valid: false,
        error: `Security violation: Approval token task mismatch. Expected "${recorded.taskId}", got "${target.taskId}".`,
      };
    }

    // 5. Normalized path check
    const normalizedRecordedPath = recorded.filePath.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
    const normalizedTargetPath = target.cleanRelativePath.toLowerCase().replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalizedRecordedPath !== normalizedTargetPath) {
      return {
        valid: false,
        error: `Security violation: Approval token path mismatch. Approved for "${recorded.filePath}", requested for "${target.cleanRelativePath}".`,
      };
    }

    // 6. Operation check
    if (recorded.operation !== 'OVERWRITE') {
      return { valid: false, error: 'Security violation: Approval token operation is not OVERWRITE.' };
    }

    // 7. Verify confirmation token proof
    if (!recorded.confirmationToken || recorded.confirmationToken !== approval.confirmationToken) {
      return { valid: false, error: 'Security violation: Forged or invalid confirmation token proof.' };
    }

    return { valid: true };
  }

  /**
   * Validates that target path stays strictly inside workspace boundary, checking both lexical and real filesystem paths,
   * rejecting symlinks on directories and files, and forbidding sensitive files.
   */
  public resolveAndValidatePath(
    relativePath: string,
    workspaceRoot = this.defaultWorkspaceRoot
  ): { resolvedPath: string; cleanRelativePath: string } {
    if (!relativePath || typeof relativePath !== 'string') {
      throw new Error('File path must be a non-empty string.');
    }

    // Reject null bytes and illegal control characters
    if (relativePath.includes('\0')) {
      throw new Error('Security violation: Null byte detected in file path.');
    }

    // Get canonical workspace root resolving any root symlinks
    const canonicalRoot = fs.existsSync(workspaceRoot)
      ? fs.realpathSync(workspaceRoot)
      : path.resolve(workspaceRoot);
    const canonicalRootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;

    // 1. Lexical Path Resolution
    let resolvedPath: string;
    let cleanRelativePath: string;

    if (path.isAbsolute(relativePath)) {
      resolvedPath = path.resolve(relativePath);
      if (!resolvedPath.startsWith(canonicalRootWithSep) && resolvedPath !== canonicalRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${canonicalRoot}".`
        );
      }
      cleanRelativePath = path.relative(canonicalRoot, resolvedPath);
    } else {
      resolvedPath = path.resolve(canonicalRoot, relativePath);
      if (!resolvedPath.startsWith(canonicalRootWithSep) && resolvedPath !== canonicalRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" attempts to traverse outside authorized workspace root "${canonicalRoot}".`
        );
      }
      cleanRelativePath = path.relative(canonicalRoot, resolvedPath);
    }

    // 2. Symlink Protection on Target File (Fail Closed)
    try {
      const lstat = fs.lstatSync(resolvedPath);
      if (lstat.isSymbolicLink()) {
        throw new Error(
          `Security violation: Target file "${relativePath}" is a symbolic link. Operations through symlinks are strictly prohibited.`
        );
      }
      const realTarget = fs.realpathSync(resolvedPath);
      if (!realTarget.startsWith(canonicalRootWithSep) && realTarget !== canonicalRoot) {
        throw new Error(
          `Security violation: Target path "${relativePath}" resolves outside authorized workspace root ("${realTarget}").`
        );
      }
    } catch (err: unknown) {
      const nodeErr = err as { code?: string; message?: string };
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }

    // 3. Step-by-step Directory Path Verification (Fail Closed on directory symlinks)
    let ancestor = path.dirname(resolvedPath);
    while (ancestor && ancestor !== canonicalRoot && ancestor !== path.dirname(ancestor)) {
      if (fs.existsSync(ancestor)) {
        const stat = fs.lstatSync(ancestor);
        if (stat.isSymbolicLink()) {
          throw new Error(
            `Security violation: Directory component "${ancestor}" is a symbolic link. Directory symlinks inside workspace are strictly prohibited.`
          );
        }
        const realAncestor = fs.realpathSync(ancestor);
        if (!realAncestor.startsWith(canonicalRootWithSep) && realAncestor !== canonicalRoot) {
          throw new Error(
            `Security violation: Ancestor path "${ancestor}" resolves to "${realAncestor}" outside authorized workspace root.`
          );
        }
      }
      ancestor = path.dirname(ancestor);
    }

    // 4. Check against protected/forbidden sensitive files
    const baseName = path.basename(resolvedPath).toLowerCase();
    const relativeLower = cleanRelativePath.toLowerCase().replace(/\\/g, '/');

    for (const forbidden of FORBIDDEN_FILENAMES_OR_PREFIXES) {
      if (
        baseName === forbidden.toLowerCase() ||
        baseName.startsWith(`${forbidden.toLowerCase()}.`) ||
        relativeLower.includes(`/${forbidden.toLowerCase()}/`) ||
        relativeLower.startsWith(`${forbidden.toLowerCase()}/`)
      ) {
        throw new Error(
          `Security violation: Access to sensitive file or directory "${forbidden}" is strictly prohibited.`
        );
      }
    }

    return { resolvedPath, cleanRelativePath: cleanRelativePath.replace(/\\/g, '/') };
  }

  /**
   * Safely writes a file to the workspace with atomic staging, symlink rejection,
   * mandatory user-identity-bound overwrite approvals, and read-back verification.
   */
  public async writeFile(
    relativePath: string,
    content: string,
    options: WorkspaceWriteOptions = {}
  ): Promise<FileWriteResult> {
    const workspaceRoot = path.resolve(options.workspaceRoot || this.defaultWorkspaceRoot);

    let resolvedPath: string;
    let cleanRelativePath: string;

    try {
      const validated = this.resolveAndValidatePath(relativePath, workspaceRoot);
      resolvedPath = validated.resolvedPath;
      cleanRelativePath = validated.cleanRelativePath;
    } catch (err: unknown) {
      return {
        path: relativePath,
        relativePath,
        success: false,
        verified: false,
        bytesWritten: 0,
        operation: 'rejected',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Check if target file exists and ensure it is not a symlink
    let fileExists = false;
    try {
      const lstat = fs.lstatSync(resolvedPath);
      fileExists = true;
      if (lstat.isSymbolicLink()) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'rejected',
          error: `Security violation: Target file "${cleanRelativePath}" is a symbolic link. Writing through symlinks is strictly prohibited.`,
        };
      }
    } catch (err: unknown) {
      const nodeErr = err as { code?: string };
      if (nodeErr.code !== 'ENOENT') {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'failed',
          error: `Filesystem access error: ${String(err)}`,
        };
      }
    }

    // If file exists, require explicit trusted approval bound to user, task, and file
    if (fileExists) {
      if (!options.trustedApproval) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'rejected',
          error: `Explicit trusted user approval is required to overwrite existing file: "${cleanRelativePath}". Arbitrary task flags are rejected.`,
        };
      }

      const validation = this.validateAndConsumeApproval(options.trustedApproval, {
        taskId: options.taskId || '',
        cleanRelativePath,
        userId: options.userId,
      });

      if (!validation.valid) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'rejected',
          error: `Security violation: ${validation.error}`,
        };
      }
    }

    const parentDir = path.dirname(resolvedPath);
    let stagingPath: string | null = null;

    try {
      // Step-by-step directory creation with symlink validation
      const canonicalRoot = fs.realpathSync(workspaceRoot);
      const canonicalRootWithSep = canonicalRoot.endsWith(path.sep) ? canonicalRoot : `${canonicalRoot}${path.sep}`;
      const relDir = path.relative(canonicalRoot, parentDir);

      if (relDir && relDir !== '.') {
        const segments = relDir.split(/[\\/]/);
        let curr = canonicalRoot;
        for (const seg of segments) {
          curr = path.join(curr, seg);
          if (fs.existsSync(curr)) {
            const stat = fs.lstatSync(curr);
            if (stat.isSymbolicLink()) {
              throw new Error(`Security violation: Directory "${curr}" is a symbolic link.`);
            }
          } else {
            fs.mkdirSync(curr);
            const stat = fs.lstatSync(curr);
            if (stat.isSymbolicLink()) {
              throw new Error(`Security violation: Created directory "${curr}" is a symbolic link.`);
            }
          }
        }
      }

      // Atomic Staging Write:
      // Create a unique temporary staging file in the parent directory using 'wx' (O_CREAT | O_EXCL)
      // This prevents pre-planted symlink hijacking.
      stagingPath = path.join(
        parentDir,
        `.__susi_staging_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.tmp`
      );

      const fileHandle = await fs.promises.open(stagingPath, 'wx');
      try {
        await fileHandle.writeFile(content, 'utf8');
        await fileHandle.sync(); // Flush data to disk
      } finally {
        await fileHandle.close();
      }

      // Verify staging file is a regular file before atomic replace
      const stagingStat = fs.lstatSync(stagingPath);
      if (stagingStat.isSymbolicLink()) {
        throw new Error('Security violation: Staging file is a symbolic link.');
      }

      // Atomic Rename:
      // Replaces the destination directory entry without following symlinks
      await fs.promises.rename(stagingPath, resolvedPath);
      stagingPath = null; // Successfully moved

      // Verify replaced file
      const finalStat = fs.lstatSync(resolvedPath);
      if (finalStat.isSymbolicLink()) {
        throw new Error('Security violation: Replaced target is a symbolic link.');
      }
      const realFinal = fs.realpathSync(resolvedPath);
      if (!realFinal.startsWith(canonicalRootWithSep) && realFinal !== canonicalRoot) {
        throw new Error(`Security violation: Replaced file resolves outside authorized root: "${realFinal}".`);
      }

      // Immediate Read-Back Verification
      const readBack = await fs.promises.readFile(resolvedPath, 'utf8');
      if (readBack !== content) {
        return {
          path: resolvedPath,
          relativePath: cleanRelativePath,
          success: false,
          verified: false,
          bytesWritten: 0,
          operation: 'failed',
          error: `Read-back verification failed for "${cleanRelativePath}". Content mismatch on disk.`,
        };
      }

      const bytesWritten = Buffer.byteLength(content, 'utf8');

      return {
        path: resolvedPath,
        relativePath: cleanRelativePath,
        success: true,
        verified: true,
        bytesWritten,
        operation: fileExists ? 'modified' : 'created',
      };
    } catch (err: unknown) {
      if (stagingPath && fs.existsSync(stagingPath)) {
        try {
          await fs.promises.unlink(stagingPath);
        } catch {}
      }
      return {
        path: resolvedPath,
        relativePath: cleanRelativePath,
        success: false,
        verified: false,
        bytesWritten: 0,
        operation: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export const workspaceFileWriter = new WorkspaceFileWriter();
