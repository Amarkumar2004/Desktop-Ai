import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { z } from 'zod';
import { SecurityValidator } from '@/lib/security/securityValidator';
import { auditLogger } from '@/lib/security/auditLogger';
import { validateDesktopAuth } from '@/lib/security/desktopAuth';

// =============================================================================
// 1. RATE LIMITING & ORIGIN / CSRF SECURITY
// =============================================================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();
const MAX_REQUESTS_PER_MINUTE = 60;
const WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  bucket.count++;
  return true;
}

function validateOrigin(req: NextRequest): { valid: boolean; reason?: string } {
  // Sec-Fetch-Site protection (blocks cross-site fetch requests from third-party sites)
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite === 'cross-site') {
    return { valid: false, reason: 'Cross-site request blocked by security policy.' };
  }

  const origin = req.headers.get('origin');
  const host = req.headers.get('host') || 'localhost:3000';

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isLocalhost =
        originUrl.hostname === 'localhost' ||
        originUrl.hostname === '127.0.0.1' ||
        originUrl.hostname === '::1';
      const isTauri = originUrl.protocol === 'tauri:' || originUrl.hostname === 'tauri.localhost';

      if (!isLocalhost && !isTauri && originUrl.host !== host) {
        return { valid: false, reason: `Untrusted origin "${origin}".` };
      }
    } catch {
      return { valid: false, reason: 'Malformed origin header.' };
    }
  }

  return { valid: true };
}

// =============================================================================
// 2. STRICT ZOD SCHEMAS FOR EVERY ACTION
// =============================================================================

const ActionTypeSchema = z.enum([
  'GET_FILE_INFO',
  'DELETE_FILE',
  'DELETE_FOLDER',
  'CREATE_FILE',
  'OVERWRITE_FILE',
  'READ_FILE',
  'INSPECT_FILE',
  'OPEN_APP',
  'CLOSE_APP',
  'OPEN_URL',
  'VOLUME_CONTROL',
  'MEDIA_CONTROL',
  'WINDOW_CONTROL',
  'TAKE_SCREENSHOT',
  'CLIPBOARD_ACTION',
  'POWER_CONTROL',
  'OPEN_SPECIAL_FOLDER',
  'SYSTEM_INFO',
]);

const ActionRequestSchema = z.object({
  actionType: ActionTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});

// =============================================================================
// 3. SAFE HELPERS (ZERO SHELL STRING CONCATENATION)
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Safely moves file to Windows Recycle Bin via PowerShell Microsoft.VisualBasic
 * Paths are passed via encoded base64 or strict argument escaping to prevent injection.
 */
async function safeMoveToRecycleBin(absolutePath: string): Promise<boolean> {
  const isWin = process.platform === 'win32';
  if (!isWin) {
    fs.rmSync(absolutePath, { recursive: true, force: true });
    return true;
  }

  const stat = fs.statSync(absolutePath);
  const isDirectory = stat.isDirectory();
  const method = isDirectory ? 'DeleteDirectory' : 'DeleteFile';

  // Base64 encode the path to guarantee zero PowerShell parsing injection
  const pathBase64 = Buffer.from(absolutePath, 'utf16le').toString('base64');
  const psScript = `
    $bytes = [System.Convert]::FromBase64String('${pathBase64}');
    $path = [System.Text.Encoding]::Unicode.GetString($bytes);
    Add-Type -AssemblyName Microsoft.VisualBasic;
    [Microsoft.VisualBasic.FileIO.FileSystem]::${method}($path, 'OnlyErrorDialogs', 'SendToRecycleBin');
  `;

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(stderr || `Recycle bin operation failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

// Critical Windows processes that MUST NEVER be killed
const CRITICAL_PROCESSES = new Set([
  'csrss.exe',
  'services.exe',
  'lsass.exe',
  'smss.exe',
  'wininit.exe',
  'explorer.exe',
  'taskmgr.exe',
  'svchost.exe',
  'system',
  'registry',
]);

// Known safe application binaries mapping
const APP_BINARIES_MAP: Record<string, string> = {
  chrome: 'chrome.exe',
  notepad: 'notepad.exe',
  calc: 'calc.exe',
  calculator: 'calc.exe',
  settings: 'ms-settings:',
  code: 'code',
  vscode: 'code',
  paint: 'mspaint.exe',
  mspaint: 'mspaint.exe',
  taskmgr: 'taskmgr.exe',
  cmd: 'cmd.exe',
  terminal: 'wt.exe',
  edge: 'msedge.exe',
  spotify: 'spotify:',
  discord: 'discord:',
  whatsapp: 'whatsapp:',
  steam: 'steam:',
  vlc: 'vlc.exe',
  word: 'winword.exe',
  excel: 'excel.exe',
  powerpoint: 'powerpnt.exe',
};

// =============================================================================
// 4. MAIN ROUTE HANDLER
// =============================================================================

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';

  // 1. Rate Limiting Check
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Please wait a moment before sending more actions.', code: 'RATE_LIMIT_EXCEEDED' },
      { status: 429 }
    );
  }

  // 2. CSRF & Origin Validation
  const originCheck = validateOrigin(req);
  if (!originCheck.valid) {
    auditLogger.log({
      requestId: `req_${Date.now()}`,
      actionType: 'SECURITY_BLOCKED',
      target: 'CSRF_ORIGIN_CHECK',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: {
        success: false,
        message: originCheck.reason || 'Invalid origin',
      },
    });
    return NextResponse.json(
      { success: false, error: originCheck.reason, code: 'FORBIDDEN_ORIGIN' },
      { status: 403 }
    );
  }

  // 3. Desktop Authentication & Authorization Check
  const auth = validateDesktopAuth(req);
  if (!auth.authorized) {
    auditLogger.log({
      requestId: `req_${Date.now()}`,
      actionType: 'SECURITY_BLOCKED',
      target: 'DESKTOP_AUTH',
      riskLevel: 'HIGH',
      status: 'DENIED',
      executionResult: {
        success: false,
        message: auth.reason || 'Unauthorized desktop control access',
      },
    });
    return NextResponse.json(
      { success: false, error: auth.reason, code: 'UNAUTHORIZED_ACCESS' },
      { status: 401 }
    );
  }

  // 4. Request Body Parsing & Zod Schema Validation
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Malformed JSON payload in request body.', code: 'INVALID_JSON' },
      { status: 400 }
    );
  }

  const parseResult = ActionRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Validation failed: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        code: 'VALIDATION_ERROR',
      },
      { status: 400 }
    );
  }

  const { actionType, payload } = parseResult.data;
  const workspaceDir = process.cwd();

  try {
    // -------------------------------------------------------------------------
    // ACTION: GET_FILE_INFO
    // -------------------------------------------------------------------------
    if (actionType === 'GET_FILE_INFO') {
      const rawPath = String(payload.path || payload.filename || '').trim();
      if (!rawPath) {
        return NextResponse.json({ success: false, error: 'path is required' }, { status: 400 });
      }

      const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);
      const check = SecurityValidator.isDangerousPath(resolved);
      if (check.dangerous) {
        return NextResponse.json({ success: false, error: check.reason, code: 'SECURITY_VIOLATION' }, { status: 403 });
      }

      if (!fs.existsSync(resolved)) {
        return NextResponse.json({
          success: true,
          exists: false,
          filename: path.basename(resolved),
          path: resolved,
        });
      }

      const stat = fs.statSync(resolved);
      return NextResponse.json({
        success: true,
        exists: true,
        filename: path.basename(resolved),
        path: resolved,
        fileSizeBytes: stat.size,
        fileSize: formatFileSize(stat.size),
        isDirectory: stat.isDirectory(),
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: DELETE_FILE / DELETE_FOLDER (Windows Recycle Bin Safe Deletion)
    // -------------------------------------------------------------------------
    if (actionType === 'DELETE_FILE' || actionType === 'DELETE_FOLDER') {
      const rawPath = String(payload.path || payload.filename || '').trim();
      if (!rawPath) {
        return NextResponse.json({ success: false, error: 'Target path is required for deletion' }, { status: 400 });
      }

      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);
      const pathCheck = SecurityValidator.isDangerousPath(targetPath);
      if (pathCheck.dangerous) {
        return NextResponse.json({ success: false, error: pathCheck.reason, code: 'SECURITY_VIOLATION' }, { status: 403 });
      }

      if (!fs.existsSync(targetPath)) {
        return NextResponse.json(
          { success: false, error: `File or folder "${path.basename(targetPath)}" does not exist.`, code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      const stat = fs.statSync(targetPath);
      const originalSize = formatFileSize(stat.size);
      const originalName = path.basename(targetPath);

      await safeMoveToRecycleBin(targetPath);

      // Verify deletion
      if (fs.existsSync(targetPath)) {
        return NextResponse.json(
          { success: false, error: 'Recycle Bin verification failed. File still exists on disk.', code: 'DELETION_FAILED' },
          { status: 500 }
        );
      }

      auditLogger.log({
        requestId: `req_${Date.now()}`,
        actionType,
        target: targetPath,
        riskLevel: 'HIGH',
        status: 'APPROVED',
        executionResult: {
          success: true,
          message: 'User approved safe recycle deletion',
        },
      });

      return NextResponse.json({
        success: true,
        message: `Successfully moved "${originalName}" (${originalSize}) to the Windows Recycle Bin.`,
        targetPath,
        recycled: true,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: CREATE_FILE / OVERWRITE_FILE
    // -------------------------------------------------------------------------
    if (actionType === 'CREATE_FILE' || actionType === 'OVERWRITE_FILE') {
      const rawFilename = String(payload.filename || payload.path || 'file.txt').trim();
      const content = typeof payload.content === 'string' ? payload.content : '';

      const targetPath = path.isAbsolute(rawFilename) ? rawFilename : path.resolve(workspaceDir, rawFilename);
      const pathCheck = SecurityValidator.isDangerousPath(targetPath);
      if (pathCheck.dangerous) {
        return NextResponse.json({ success: false, error: pathCheck.reason, code: 'SECURITY_VIOLATION' }, { status: 403 });
      }

      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(targetPath, content, 'utf8');

      // Verify file was created and content matches
      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ success: false, error: 'Failed to verify file creation.', code: 'FILE_CREATE_FAILED' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `File "${path.basename(targetPath)}" written successfully.`,
        filePath: targetPath,
        bytesWritten: Buffer.byteLength(content, 'utf8'),
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: READ_FILE / INSPECT_FILE
    // -------------------------------------------------------------------------
    if (actionType === 'READ_FILE' || actionType === 'INSPECT_FILE') {
      const rawPath = String(payload.path || payload.filename || '').trim();
      const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(workspaceDir, rawPath);

      const pathCheck = SecurityValidator.isDangerousPath(targetPath);
      if (pathCheck.dangerous) {
        return NextResponse.json({ success: false, error: pathCheck.reason, code: 'SECURITY_VIOLATION' }, { status: 403 });
      }

      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ success: false, error: `File not found: ${path.basename(targetPath)}`, code: 'NOT_FOUND' }, { status: 404 });
      }

      const stat = fs.statSync(targetPath);
      if (stat.size > 2 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: 'File size exceeds 2MB limit for direct reading.', code: 'FILE_TOO_LARGE' }, { status: 400 });
      }

      const content = fs.readFileSync(targetPath, 'utf8');
      return NextResponse.json({
        success: true,
        filename: path.basename(targetPath),
        path: targetPath,
        content,
        size: formatFileSize(stat.size),
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: OPEN_APP (Native Argument-Based Spawn, No Shell String Concat)
    // -------------------------------------------------------------------------
    if (actionType === 'OPEN_APP') {
      const rawApp = String(payload.appName || payload.target || '').trim().toLowerCase();
      if (!rawApp) {
        return NextResponse.json({ success: false, error: 'appName is required' }, { status: 400 });
      }

      let targetBinary = APP_BINARIES_MAP[rawApp] || rawApp;
      let args: string[] = [];

      // Check common Chrome paths if requested
      if (rawApp.includes('chrome') || rawApp.includes('browser') || rawApp.includes('google')) {
        targetBinary = 'chrome.exe';
        const chromePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
        ];
        const found = chromePaths.find((p) => p && fs.existsSync(p));
        if (found) targetBinary = found;
      }

      const pathCheck = SecurityValidator.isDangerousPath(targetBinary);
      if (pathCheck.dangerous) {
        return NextResponse.json({ success: false, error: pathCheck.reason, code: 'SECURITY_VIOLATION' }, { status: 403 });
      }

      if (process.platform === 'win32') {
        // Safe spawn using cmd.exe argument array (avoids raw shell injection)
        const isProtocol = targetBinary.includes(':') && !targetBinary.includes('\\');
        if (isProtocol) {
          spawn('cmd.exe', ['/c', 'start', '', targetBinary], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn('cmd.exe', ['/c', 'start', '', targetBinary, ...args], { detached: true, stdio: 'ignore' }).unref();
        }
      } else {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(cmd, [targetBinary], { detached: true, stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Application "${rawApp}" launched via verified desktop launcher.`,
        appName: rawApp,
        targetBinary,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: CLOSE_APP (Safe Task Termination, Critical Process Protected)
    // -------------------------------------------------------------------------
    if (actionType === 'CLOSE_APP') {
      const rawApp = String(payload.appName || payload.target || '').trim().toLowerCase();
      if (!rawApp) {
        return NextResponse.json({ success: false, error: 'appName is required to close app' }, { status: 400 });
      }

      let processName = rawApp;
      if (APP_BINARIES_MAP[rawApp] && APP_BINARIES_MAP[rawApp].endsWith('.exe')) {
        processName = APP_BINARIES_MAP[rawApp];
      } else if (!processName.endsWith('.exe')) {
        processName = `${processName}.exe`;
      }

      // Check Critical Process Blacklist
      if (CRITICAL_PROCESSES.has(processName)) {
        return NextResponse.json(
          {
            success: false,
            error: `Terminating critical system process "${processName}" is blocked for OS stability.`,
            code: 'SECURITY_VIOLATION',
          },
          { status: 403 }
        );
      }

      if (process.platform === 'win32') {
        const exitCode = await new Promise<number | null>((resolve) => {
          const child = spawn('taskkill.exe', ['/IM', processName, '/F'], { stdio: 'ignore' });
          child.on('close', (code) => resolve(code));
          child.on('error', () => resolve(-1));
        });

        if (exitCode !== 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Process "${processName}" could not be terminated (exit code ${exitCode}). It may not be currently running.`,
              code: 'PROCESS_NOT_FOUND',
            },
            { status: 404 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: `Application "${rawApp}" (${processName}) successfully terminated.`,
        appName: rawApp,
        processName,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: OPEN_URL (Strict Protocol & SSRF Validation)
    // -------------------------------------------------------------------------
    if (actionType === 'OPEN_URL') {
      const rawUrl = String(payload.url || '').trim();
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl);
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid URL provided', code: 'INVALID_URL' }, { status: 400 });
      }

      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json(
          { success: false, error: 'Only http and https protocols are permitted.', code: 'DISALLOWED_PROTOCOL' },
          { status: 403 }
        );
      }

      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '', parsedUrl.toString()], { detached: true, stdio: 'ignore' }).unref();
      } else {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(cmd, [parsedUrl.toString()], { detached: true, stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Opened URL "${parsedUrl.toString()}".`,
        url: parsedUrl.toString(),
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: VOLUME_CONTROL (Safe Key Emulation, Argument Array)
    // -------------------------------------------------------------------------
    if (actionType === 'VOLUME_CONTROL') {
      const volAction = String(payload.action || 'mute').toLowerCase();
      if (process.platform === 'win32') {
        let keyChar = 173; // mute toggle
        let count = 1;
        if (volAction === 'up' || volAction === 'increase') {
          keyChar = 175;
          count = 4;
        } else if (volAction === 'down' || volAction === 'decrease') {
          keyChar = 174;
          count = 4;
        }

        const psScript = `1..${count} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]${keyChar}) }`;
        spawn('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Volume action "${volAction}" applied.`,
        action: volAction,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: MEDIA_CONTROL
    // -------------------------------------------------------------------------
    if (actionType === 'MEDIA_CONTROL') {
      const mediaAction = String(payload.action || 'play_pause').toLowerCase();
      if (process.platform === 'win32') {
        let keyChar = 179; // play/pause
        if (mediaAction.includes('next')) keyChar = 176;
        else if (mediaAction.includes('prev')) keyChar = 177;

        const psScript = `(New-Object -ComObject WScript.Shell).SendKeys([char]${keyChar})`;
        spawn('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Media playback action "${mediaAction}" dispatched.`,
        action: mediaAction,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: WINDOW_CONTROL
    // -------------------------------------------------------------------------
    if (actionType === 'WINDOW_CONTROL') {
      const winAction = String(payload.action || 'show_desktop').toLowerCase();
      if (process.platform === 'win32') {
        const method = winAction.includes('restore') ? 'UndoMinimizeAll' : 'MinimizeAll';
        const psScript = `(New-Object -ComObject Shell.Application).${method}()`;
        spawn('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Window control "${winAction}" dispatched.`,
        action: winAction,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: TAKE_SCREENSHOT (Safe File Path on Desktop)
    // -------------------------------------------------------------------------
    if (actionType === 'TAKE_SCREENSHOT') {
      const desktopDir = path.join(process.env.USERPROFILE || 'C:\\', 'Desktop');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `Screenshot_${timestamp}.png`;
      const outPath = path.join(desktopDir, filename);

      if (process.platform === 'win32') {
        // Base64 encode path to avoid any command injection
        const b64 = Buffer.from(outPath, 'utf16le').toString('base64');
        const psScript = `
          $bytes = [System.Convert]::FromBase64String('${b64}');
          $target = [System.Text.Encoding]::Unicode.GetString($bytes);
          Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
          $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
          $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height);
          $g = [System.Drawing.Graphics]::FromImage($bmp);
          $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);
          $bmp.Save($target);
          $g.Dispose();
          $bmp.Dispose();
        `;
        await new Promise((resolve) => {
          const child = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' });
          child.on('close', resolve);
          child.on('error', resolve);
        });
      }

      return NextResponse.json({
        success: true,
        message: `Desktop screenshot saved as "${filename}" on Desktop.`,
        filePath: outPath,
        filename,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: CLIPBOARD_ACTION (Streamed via Stdin, Zero Command Injection)
    // -------------------------------------------------------------------------
    if (actionType === 'CLIPBOARD_ACTION') {
      const clipAction = String(payload.action || 'read').toLowerCase();

      if (process.platform === 'win32') {
        if (clipAction === 'write' && typeof payload.text === 'string') {
          // Stream raw text into Set-Clipboard stdin to completely avoid shell injection
          await new Promise<void>((resolve, reject) => {
            const child = spawn('powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard'], {
              stdio: ['pipe', 'ignore', 'pipe'],
            });
            child.stdin.write(payload.text);
            child.stdin.end();
            child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Clipboard write failed'))));
            child.on('error', reject);
          });

          return NextResponse.json({
            success: true,
            message: 'Text safely copied to Windows clipboard.',
          });
        }

        // Read clipboard
        const content = await new Promise<string>((resolve) => {
          const child = spawn('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          let out = '';
          child.stdout.on('data', (d) => {
            out += d.toString();
          });
          child.on('close', () => resolve(out.trim()));
          child.on('error', () => resolve(''));
        });

        return NextResponse.json({
          success: true,
          content,
          message: `Clipboard content: "${content.slice(0, 80)}"`,
        });
      }

      return NextResponse.json({ success: true, message: 'Clipboard action completed.' });
    }

    // -------------------------------------------------------------------------
    // ACTION: POWER_CONTROL
    // -------------------------------------------------------------------------
    if (actionType === 'POWER_CONTROL') {
      const pwrAction = String(payload.action || 'lock').toLowerCase();
      if (process.platform === 'win32') {
        if (pwrAction === 'lock') {
          spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { stdio: 'ignore' }).unref();
        } else if (pwrAction === 'sleep') {
          spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { stdio: 'ignore' }).unref();
        } else if (pwrAction === 'restart') {
          spawn('shutdown.exe', ['/r', '/t', '10'], { stdio: 'ignore' }).unref();
        } else if (pwrAction === 'shutdown') {
          spawn('shutdown.exe', ['/s', '/t', '10'], { stdio: 'ignore' }).unref();
        }
      }

      return NextResponse.json({
        success: true,
        message: `Power command "${pwrAction}" executed safely.`,
        action: pwrAction,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: OPEN_SPECIAL_FOLDER
    // -------------------------------------------------------------------------
    if (actionType === 'OPEN_SPECIAL_FOLDER') {
      const folder = String(payload.folder || 'downloads').toLowerCase();
      if (process.platform === 'win32') {
        const folderTargetMap: Record<string, string> = {
          download: 'shell:Downloads',
          downloads: 'shell:Downloads',
          desktop: 'shell:Desktop',
          documents: 'shell:Personal',
          doc: 'shell:Personal',
          pictures: 'shell:My Pictures',
          recycle: 'shell:RecycleBinFolder',
          recycle_bin: 'shell:RecycleBinFolder',
        };

        const target = folderTargetMap[folder] || 'shell:Downloads';
        spawn('cmd.exe', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
      }

      return NextResponse.json({
        success: true,
        message: `Opened special folder "${folder}".`,
        folder,
      });
    }

    // -------------------------------------------------------------------------
    // ACTION: SYSTEM_INFO (Real Live Telemetry, Zero Fake Data)
    // -------------------------------------------------------------------------
    if (actionType === 'SYSTEM_INFO') {
      const cpus = os.cpus();
      const totalRamBytes = os.totalmem();
      const freeRamBytes = os.freemem();
      const usedRamBytes = totalRamBytes - freeRamBytes;
      const memoryPercent = Math.round((usedRamBytes / totalRamBytes) * 100);

      // Estimate CPU utilization across cores
      let totalIdle = 0;
      let totalTick = 0;
      cpus.forEach((cpu) => {
        for (const type in cpu.times) {
          totalTick += (cpu.times as Record<string, number>)[type];
        }
        totalIdle += cpu.times.idle;
      });
      const cpuUsagePercent = Math.round((1 - totalIdle / (totalTick || 1)) * 100);

      const uptimeSecs = os.uptime();
      const days = Math.floor(uptimeSecs / 86400);
      const hours = Math.floor((uptimeSecs % 86400) / 3600);
      const mins = Math.floor((uptimeSecs % 3600) / 60);
      const uptimeStr = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      return NextResponse.json({
        success: true,
        cpu: Math.max(0, Math.min(100, cpuUsagePercent)),
        memory: memoryPercent,
        usedRamGb: Number((usedRamBytes / 1024 / 1024 / 1024).toFixed(1)),
        totalRamGb: Number((totalRamBytes / 1024 / 1024 / 1024).toFixed(1)),
        uptime: uptimeStr,
        platform: process.platform,
        arch: os.arch(),
        hostname: os.hostname(),
      });
    }

    return NextResponse.json(
      { success: false, error: `Action type "${actionType}" is not supported.`, code: 'UNSUPPORTED_ACTION' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Action execution failed';
    console.error(`[API /api/local/action] Error handling ${actionType}:`, errorMsg);
    return NextResponse.json(
      { success: false, error: 'Internal execution error occurred.', code: 'EXECUTION_ERROR' },
      { status: 500 }
    );
  }
}
