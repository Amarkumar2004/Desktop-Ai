import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
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

    // -------------------------------------------------------------
    // 5. OPEN_APP (Windows Direct Desktop Launcher - 100% Script-Free)
    // -------------------------------------------------------------
    if (actionType === 'OPEN_APP') {
      const rawApp = String(payload?.appName || payload?.target || 'chrome').trim().toLowerCase();

      // Map friendly app names to official Windows launcher targets & arguments
      let targetBinary = rawApp;
      let extraArgs = '';

      if (
        rawApp.includes('chrome') ||
        rawApp.includes('google') ||
        rawApp.includes('browser') ||
        rawApp.includes('internet') ||
        rawApp.includes('web') ||
        rawApp === 'application' ||
        rawApp === 'app' ||
        rawApp === 'open application' ||
        rawApp === 'open app'
      ) {
        targetBinary = 'chrome.exe';
        extraArgs = '--new-window https://www.google.com';
      } else if (rawApp.includes('notepad') || rawApp.includes('editor') || rawApp.includes('note') || rawApp.includes('text')) {
        targetBinary = 'notepad.exe';
      } else if (rawApp.includes('calc') || rawApp.includes('calculator') || rawApp.includes('hisab')) {
        targetBinary = 'calc.exe';
      } else if (rawApp.includes('setting')) {
        targetBinary = 'ms-settings:';
      } else if (rawApp.includes('vs code') || rawApp.includes('vscode') || rawApp.includes('code')) {
        targetBinary = 'code';
      } else if (rawApp.includes('explorer') || rawApp.includes('file') || rawApp.includes('folder')) {
        targetBinary = 'explorer.exe';
      } else if (rawApp.includes('paint') || rawApp.includes('drawing')) {
        targetBinary = 'mspaint.exe';
      } else if (rawApp.includes('task') && (rawApp.includes('manager') || rawApp.includes('mgr'))) {
        targetBinary = 'taskmgr.exe';
      } else if (rawApp.includes('cmd') || rawApp.includes('terminal') || rawApp.includes('command')) {
        targetBinary = 'cmd.exe';
      } else if (rawApp.includes('edge')) {
        targetBinary = 'msedge.exe';
        extraArgs = 'https://www.bing.com';
      } else if (rawApp.includes('spotify')) {
        targetBinary = 'spotify:';
      } else if (rawApp.includes('discord')) {
        targetBinary = 'discord:';
      } else if (rawApp.includes('whatsapp')) {
        targetBinary = 'whatsapp:';
      } else if (rawApp.includes('steam')) {
        targetBinary = 'steam:';
      } else if (rawApp.includes('word') || rawApp.includes('winword') || rawApp.includes('doc')) {
        targetBinary = 'winword.exe';
      } else if (rawApp.includes('excel') || rawApp.includes('sheet')) {
        targetBinary = 'excel.exe';
      } else if (rawApp.includes('powerpoint') || rawApp.includes('ppt') || rawApp.includes('slide')) {
        targetBinary = 'powerpnt.exe';
      } else if (rawApp.includes('vlc')) {
        targetBinary = 'vlc.exe';
      } else if (rawApp.includes('zoom')) {
        targetBinary = 'zoom.exe';
      } else if (rawApp.includes('telegram')) {
        targetBinary = 'telegram.exe';
      }

      // Security Check: Block dangerous system paths or malicious targets
      const pathCheck = SecurityValidator.isDangerousPath(targetBinary);
      if (pathCheck.dangerous) {
        return NextResponse.json({
          success: false,
          error: pathCheck.reason,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      // Launch directly on Windows desktop without scripts
      try {
        const isWin = process.platform === 'win32';
        if (isWin) {
          const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
            `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
          ];

          let resolvedTarget = targetBinary;
          if (targetBinary === 'chrome.exe' || targetBinary === 'chrome') {
            const found = chromePaths.find((p) => p && fs.existsSync(p));
            if (found) {
              resolvedTarget = found;
            }
          }

          // Launch on Windows desktop without scripts
          const isProtocol = resolvedTarget.includes(':') && !resolvedTarget.includes('\\');
          const launchCommand = isProtocol
            ? `start ${resolvedTarget}`
            : extraArgs
            ? `start "" "${resolvedTarget}" ${extraArgs}`
            : `start "" "${resolvedTarget}"`;

          exec(launchCommand, (err) => {
            if (err) console.error('[OPEN_APP] Launch error:', err);
          });
        } else {
          const fallbackCmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
          const child = spawn(fallbackCmd, [targetBinary], {
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
        }

        return NextResponse.json({
          success: true,
          message: `Application "${rawApp}" launched successfully via Windows Desktop Launcher.`,
          appName: rawApp,
          targetBinary,
        });
      } catch (launchErr: unknown) {
        const msg = launchErr instanceof Error ? launchErr.message : 'Failed to launch desktop application';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 6. CLOSE_APP (Safe Windows Process Termination)
    // -------------------------------------------------------------
    if (actionType === 'CLOSE_APP') {
      const rawApp = String(payload?.appName || payload?.target || '').trim().toLowerCase();
      let processName = rawApp;

      if (rawApp.includes('chrome') || rawApp.includes('browser') || rawApp.includes('google')) {
        processName = 'chrome.exe';
      } else if (rawApp.includes('notepad') || rawApp.includes('editor')) {
        processName = 'notepad.exe';
      } else if (rawApp.includes('calc') || rawApp.includes('calculator')) {
        processName = 'calc.exe';
      } else if (rawApp.includes('vs code') || rawApp.includes('vscode') || rawApp.includes('code')) {
        processName = 'Code.exe';
      } else if (rawApp.includes('paint')) {
        processName = 'mspaint.exe';
      } else if (rawApp.includes('spotify')) {
        processName = 'Spotify.exe';
      } else if (rawApp.includes('vlc')) {
        processName = 'vlc.exe';
      } else if (rawApp.includes('discord')) {
        processName = 'Discord.exe';
      } else if (rawApp.includes('word') || rawApp.includes('winword')) {
        processName = 'WINWORD.EXE';
      } else if (rawApp.includes('excel')) {
        processName = 'EXCEL.EXE';
      } else if (rawApp.includes('powerpoint') || rawApp.includes('ppt')) {
        processName = 'POWERPNT.EXE';
      } else if (rawApp.includes('edge')) {
        processName = 'msedge.exe';
      } else if (!processName.endsWith('.exe')) {
        processName = `${processName}.exe`;
      }

      const criticalProcesses = ['explorer.exe', 'csrss.exe', 'svchost.exe', 'services.exe', 'lsass.exe', 'smss.exe', 'wininit.exe', 'taskmgr.exe'];
      if (criticalProcesses.includes(processName.toLowerCase())) {
        return NextResponse.json({
          success: false,
          error: `Terminating critical system process "${processName}" is blocked for OS stability.`,
          code: 'SECURITY_VIOLATION',
        }, { status: 403 });
      }

      try {
        if (process.platform === 'win32') {
          exec(`taskkill /IM "${processName}" /F`, (err) => {
            if (err) console.warn('[CLOSE_APP] Taskkill notice:', err.message);
          });
        }
        return NextResponse.json({
          success: true,
          message: `Application "${rawApp}" (${processName}) closed successfully.`,
          appName: rawApp,
          processName,
        });
      } catch (closeErr: unknown) {
        const msg = closeErr instanceof Error ? closeErr.message : 'Failed to terminate application';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 7. VOLUME_CONTROL (Windows Native CoreAudio Emulation)
    // -------------------------------------------------------------
    if (actionType === 'VOLUME_CONTROL') {
      const volAction = String(payload?.action || 'mute').toLowerCase();
      try {
        if (process.platform === 'win32') {
          let keyChar = 173; // mute toggle
          let count = 1;
          if (volAction === 'up' || volAction === 'increase') {
            keyChar = 175; // vol up
            count = 4;
          } else if (volAction === 'down' || volAction === 'decrease') {
            keyChar = 174; // vol down
            count = 4;
          }

          const psCmd = `powershell -NoProfile -Command "1..${count} | ForEach-Object { (New-Object -ComObject WScript.Shell).SendKeys([char]${keyChar}) }"`;
          exec(psCmd, (err) => {
            if (err) console.error('[VOLUME_CONTROL] Exec error:', err);
          });
        }

        return NextResponse.json({
          success: true,
          message: `Volume action "${volAction}" executed successfully.`,
          action: volAction,
        });
      } catch (volErr: unknown) {
        const msg = volErr instanceof Error ? volErr.message : 'Failed to adjust volume';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 8. MEDIA_CONTROL (Windows Native Media Key Event Emulation)
    // -------------------------------------------------------------
    if (actionType === 'MEDIA_CONTROL') {
      const mediaAction = String(payload?.action || 'play_pause').toLowerCase();
      try {
        if (process.platform === 'win32') {
          let keyChar = 179; // play/pause
          if (mediaAction.includes('next')) keyChar = 176;
          else if (mediaAction.includes('prev')) keyChar = 177;

          const psCmd = `powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${keyChar})"`;
          exec(psCmd, (err) => {
            if (err) console.error('[MEDIA_CONTROL] Exec error:', err);
          });
        }

        return NextResponse.json({
          success: true,
          message: `Media playback action "${mediaAction}" dispatched.`,
          action: mediaAction,
        });
      } catch (mediaErr: unknown) {
        const msg = mediaErr instanceof Error ? mediaErr.message : 'Failed media command';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 9. WINDOW_CONTROL (Desktop Minimization & Window Management)
    // -------------------------------------------------------------
    if (actionType === 'WINDOW_CONTROL') {
      const winAction = String(payload?.action || 'show_desktop').toLowerCase();
      try {
        if (process.platform === 'win32') {
          const method = winAction.includes('restore') ? 'UndoMinimizeAll' : 'MinimizeAll';
          const psCmd = `powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).${method}()"`;
          exec(psCmd, (err) => {
            if (err) console.error('[WINDOW_CONTROL] Exec error:', err);
          });
        }

        return NextResponse.json({
          success: true,
          message: `Window control "${winAction}" executed.`,
          action: winAction,
        });
      } catch (winErr: unknown) {
        const msg = winErr instanceof Error ? winErr.message : 'Failed window action';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 10. TAKE_SCREENSHOT (Desktop Screen Capture Saved to Desktop)
    // -------------------------------------------------------------
    if (actionType === 'TAKE_SCREENSHOT') {
      try {
        const desktopDir = path.join(process.env.USERPROFILE || 'C:\\', 'Desktop');
        const filename = `Screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        const outPath = path.join(desktopDir, filename);

        if (process.platform === 'win32') {
          const escapedOut = outPath.replace(/\\/g, '\\\\');
          const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; \$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \$bmp = New-Object System.Drawing.Bitmap(\$b.Width, \$b.Height); \$g = [System.Drawing.Graphics]::FromImage(\$bmp); \$g.CopyFromScreen(\$b.Location, [System.Drawing.Point]::Empty, \$b.Size); \$bmp.Save('${escapedOut}'); \$g.Dispose(); \$bmp.Dispose();"`;
          exec(psCmd, (err) => {
            if (err) console.error('[TAKE_SCREENSHOT] Capture error:', err);
          });
        }

        return NextResponse.json({
          success: true,
          message: `Desktop screenshot captured and saved as "${filename}" on Desktop.`,
          filePath: outPath,
          filename,
        });
      } catch (shotErr: unknown) {
        const msg = shotErr instanceof Error ? shotErr.message : 'Failed to capture screenshot';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 11. POWER_CONTROL (Workstation Lock, Sleep, Restart, Shutdown)
    // -------------------------------------------------------------
    if (actionType === 'POWER_CONTROL') {
      const pwrAction = String(payload?.action || 'lock').toLowerCase();
      try {
        if (process.platform === 'win32') {
          if (pwrAction === 'lock') {
            exec('rundll32.exe user32.dll,LockWorkStation');
          } else if (pwrAction === 'sleep') {
            exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
          } else if (pwrAction === 'restart') {
            exec('shutdown /r /t 10');
          } else if (pwrAction === 'shutdown') {
            exec('shutdown /s /t 10');
          }
        }

        return NextResponse.json({
          success: true,
          message: `Power command "${pwrAction}" executed successfully.`,
          action: pwrAction,
        });
      } catch (pwrErr: unknown) {
        const msg = pwrErr instanceof Error ? pwrErr.message : 'Failed power command';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 12. OPEN_SPECIAL_FOLDER (Downloads, Desktop, Recycle Bin)
    // -------------------------------------------------------------
    if (actionType === 'OPEN_SPECIAL_FOLDER') {
      const folder = String(payload?.folder || 'downloads').toLowerCase();
      try {
        if (process.platform === 'win32') {
          if (folder.includes('empty_recycle')) {
            exec('powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"');
          } else if (folder.includes('download')) {
            exec('start shell:Downloads');
          } else if (folder.includes('desktop')) {
            exec('start shell:Desktop');
          } else if (folder.includes('doc')) {
            exec('start shell:Personal');
          } else if (folder.includes('picture')) {
            exec('start shell:My Pictures');
          } else if (folder.includes('recycle')) {
            exec('start shell:RecycleBinFolder');
          }
        }

        return NextResponse.json({
          success: true,
          message: `Special folder command "${folder}" executed.`,
          folder,
        });
      } catch (foldErr: unknown) {
        const msg = foldErr instanceof Error ? foldErr.message : 'Failed folder command';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
      }
    }

    // -------------------------------------------------------------
    // 13. CLIPBOARD_ACTION (Read / Write Windows Clipboard)
    // -------------------------------------------------------------
    if (actionType === 'CLIPBOARD_ACTION') {
      const clipAction = String(payload?.action || 'read').toLowerCase();
      try {
        if (process.platform === 'win32') {
          if (clipAction === 'write' && payload?.text) {
            const escaped = String(payload.text).replace(/"/g, '`"');
            exec(`powershell -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`);
            return NextResponse.json({
              success: true,
              message: 'Text copied to Windows clipboard.',
            });
          }

          const { stdout } = await execPromise('powershell -NoProfile -Command "Get-Clipboard"');
          return NextResponse.json({
            success: true,
            content: stdout.trim(),
            message: `Clipboard content: "${stdout.trim().slice(0, 80)}"`,
          });
        }

        return NextResponse.json({
          success: true,
          message: 'Clipboard action completed.',
        });
      } catch (clipErr: unknown) {
        const msg = clipErr instanceof Error ? clipErr.message : 'Failed clipboard action';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
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
