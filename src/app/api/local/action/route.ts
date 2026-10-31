import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { SecurityValidator } from '@/lib/security/securityValidator';

const execPromise = util.promisify(exec);

// Formats file sizes into human-readable strings
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Safely moves a file or folder to the Windows Recycle Bin
async function moveToRecycleBin(absolutePath: string): Promise<boolean> {
  const isWin = process.platform === 'win32';
  if (!isWin) {
    // Non-Windows fallback: remove safely
    fs.rmSync(absolutePath, { recursive: true, force: true });
    return true;
  }

  const stat = fs.statSync(absolutePath);
  const isDirectory = stat.isDirectory();
  const escapedPath = absolutePath.replace(/'/g, "''");

  const method = isDirectory ? 'DeleteDirectory' : 'DeleteFile';
  const psCommand = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${method}('${escapedPath}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;

  try {
    await execPromise(`powershell.exe -NoProfile -NonInteractive -Command "${psCommand}"`, {
      timeout: 10000,
    });
    return true;
  } catch (err: unknown) {
    console.error('[RecycleBin] PowerShell recycle failed:', err);
    throw new Error(`Failed to move to Recycle Bin: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionType, payload } = body;

    if (!actionType) {
      return NextResponse.json({ success: false, error: 'actionType is required' }, { status: 400 });
    }

    const workspaceDir = process.cwd();

    // -------------------------------------------------------------
    // 1. GET_FILE_INFO (Inspects file existence, path, and size)
    // -------------------------------------------------------------
    if (actionType === 'GET_FILE_INFO') {
      const rawPath = String(payload?.path || payload?.filename || '');
      const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);

      // Check dangerous path
      const check = SecurityValidator.isDangerousPath(resolvedPath);
      if (check.dangerous) {
        return NextResponse.json({
          success: false,
          error: check.reason,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      if (!fs.existsSync(resolvedPath)) {
        return NextResponse.json({
          success: true,
          exists: false,
          filename: path.basename(resolvedPath),
          path: resolvedPath,
        });
      }

      const stat = fs.statSync(resolvedPath);
      return NextResponse.json({
        success: true,
        exists: true,
        filename: path.basename(resolvedPath),
        path: resolvedPath,
        fileSizeBytes: stat.size,
        fileSize: formatFileSize(stat.size),
        isDirectory: stat.isDirectory(),
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    // -------------------------------------------------------------
    // 2. DELETE_FILE / DELETE_FOLDER (Moves to Windows Recycle Bin)
    // -------------------------------------------------------------
    if (actionType === 'DELETE_FILE' || actionType === 'DELETE_FOLDER') {
      const rawPath = String(payload?.path || payload?.filename || '');
      if (!rawPath) {
        return NextResponse.json({ success: false, error: 'Target path is required for deletion' }, { status: 400 });
      }

      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);

      // Security check: Block dangerous system paths
      const pathCheck = SecurityValidator.isDangerousPath(targetPath);
      if (pathCheck.dangerous) {
        return NextResponse.json({
          success: false,
          error: pathCheck.reason,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({
          success: false,
          error: `File or folder "${path.basename(targetPath)}" does not exist.`,
        }, { status: 404 });
      }

      const stat = fs.statSync(targetPath);
      const originalSize = formatFileSize(stat.size);
      const originalName = path.basename(targetPath);

      // Execute safe move to Windows Recycle Bin
      await moveToRecycleBin(targetPath);

      // Verify file is gone
      const existsAfter = fs.existsSync(targetPath);
      if (existsAfter) {
        return NextResponse.json({
          success: false,
          error: 'File deletion verification failed. File still exists.',
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully moved "${originalName}" (${originalSize}) to the Windows Recycle Bin.`,
        targetPath,
        recycled: true,
        timestamp: new Date().toISOString(),
      });
    }

    // -------------------------------------------------------------
    // 3. CREATE_FILE / OVERWRITE_FILE
    // -------------------------------------------------------------
    if (actionType === 'CREATE_FILE' || actionType === 'OVERWRITE_FILE') {
      const filename = payload?.filename || `generated-${Date.now()}.txt`;
      const content = payload?.content || '// Created via SUSI AI\n';
      const rawPath = payload?.path || path.join('src', 'generated', path.basename(filename));

      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);

      // Security Check
      const check = SecurityValidator.isDangerousPath(targetPath);
      if (check.dangerous) {
        return NextResponse.json({
          success: false,
          error: check.reason,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content, 'utf8');

      return NextResponse.json({
        success: true,
        message: `File created successfully at ${path.relative(workspaceDir, targetPath)}`,
        filePath: targetPath,
      });
    }

    // -------------------------------------------------------------
    // 4. EXECUTE_COMMAND (Secure terminal command execution)
    // -------------------------------------------------------------
    if (actionType === 'EXECUTE_COMMAND' || actionType === 'TERMINAL_COMMAND') {
      const command = String(payload?.command || '').trim();
      if (!command) {
        return NextResponse.json({ success: false, error: 'Command string is required' }, { status: 400 });
      }

      // Security Check: Block dangerous command signatures
      const cmdCheck = SecurityValidator.inspectCommand(command);
      if (!cmdCheck.safe) {
        return NextResponse.json({
          success: false,
          error: cmdCheck.reason,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      try {
        const { stdout, stderr } = await execPromise(command, {
          cwd: workspaceDir,
          timeout: 30000,
        });

        return NextResponse.json({
          success: true,
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      } catch (cmdErr: unknown) {
        const msg = cmdErr instanceof Error ? cmdErr.message : 'Command execution failed';
        return NextResponse.json({
          success: false,
          error: msg,
          command,
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Action ${actionType} acknowledged.`,
      payload,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Action execution failed';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
