/**
 * Security Validator & Threat Inspector
 * Inspects commands, paths, and payloads to block inherently dangerous operations,
 * prevents UAC bypasses, blocks Windows system destruction, and scrubs secrets from logs.
 */

// Forbidden Windows system directories
const DANGEROUS_PATH_PATTERNS = [
  /^[a-zA-Z]:\\windows/i,
  /^[a-zA-Z]:\\system volume information/i,
  /^[a-zA-Z]:\\recovery/i,
  /^[a-zA-Z]:\\boot/i,
  /^[a-zA-Z]:\\pagefile\.sys/i,
  /^[a-zA-Z]:\\hiberfil\.sys/i,
  /system32/i,
  /syswow64/i,
  /%windir%/i,
  /%systemroot%/i,
  /\/etc\//i,
  /\/bin\//i,
  /\/sbin\//i,
  /\/usr\/bin/i,
];

// Dangerous terminal command signatures that must be BLOCKED outright
const DANGEROUS_COMMAND_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\bformat\s+[a-zA-Z]:/i,
    reason: 'Drive formatting commands are strictly prohibited.',
  },
  {
    pattern: /\bdiskpart\b/i,
    reason: 'Direct disk partition modification is prohibited.',
  },
  {
    pattern: /\brmdir\s+[\/\\]s\s+[\/\\]q\s+[a-zA-Z]:[\/\\]?$/i,
    reason: 'Root drive tree deletion is prohibited.',
  },
  {
    pattern: /\bdel\s+[\/\\]f\s+[\/\\]s\s+[\/\\]q\s+[a-zA-Z]:[\/\\]/i,
    reason: 'Recursive root file wiping is prohibited.',
  },
  {
    pattern: /DisableRealtimeMonitoring\s+\$true/i,
    reason: 'Disabling Windows Defender Realtime Monitoring is strictly blocked.',
  },
  {
    pattern: /Set-MpPreference.*-Disable/i,
    reason: 'Tampering with Windows Defender preferences is prohibited.',
  },
  {
    pattern: /sc\s+(?:stop|delete)\s+windefend/i,
    reason: 'Stopping or disabling Windows Defender service is prohibited.',
  },
  {
    pattern: /netsh\s+advfirewall\s+set\s+allprofiles\s+state\s+off/i,
    reason: 'Disabling Windows Firewall across all profiles is blocked.',
  },
  {
    pattern: /Set-NetFirewallProfile.*-Enabled\s+False/i,
    reason: 'Disabling Windows Firewall via PowerShell is blocked.',
  },
  {
    pattern: /reg\s+add.*ConsentPromptBehaviorAdmin.*0/i,
    reason: 'Attempting to bypass Windows UAC (User Account Control) is strictly blocked.',
  },
  {
    pattern: /reg\s+delete\s+["']?HKLM\\SYSTEM/i,
    reason: 'Destructive registry deletion in HKLM\\SYSTEM is prohibited.',
  },
  {
    pattern: /reg\s+delete\s+["']?HKLM\\SOFTWARE\\Microsoft\\Windows/i,
    reason: 'Destructive registry deletion in Windows system hive is prohibited.',
  },
  {
    pattern: /bcdedit.*\/delete/i,
    reason: 'Modifying Windows Boot Configuration Data is prohibited.',
  },
  {
    pattern: /vssadmin\s+delete\s+shadows/i,
    reason: 'Ransomware-associated shadow copy deletion is blocked.',
  },
];

export class SecurityValidator {
  /**
   * Inspects a file or folder path for critical Windows system locations.
   */
  public static isDangerousPath(targetPath: string): { dangerous: boolean; reason?: string } {
    if (!targetPath || typeof targetPath !== 'string') {
      return { dangerous: false };
    }

    const normalized = targetPath.trim().replace(/\//g, '\\');

    for (const regex of DANGEROUS_PATH_PATTERNS) {
      if (regex.test(normalized)) {
        return {
          dangerous: true,
          reason: `Target path touches critical system OS files or directory (${targetPath}).`,
        };
      }
    }

    return { dangerous: false };
  }

  /**
   * Inspects terminal/PowerShell command string for destructive or unauthorized payloads.
   */
  public static inspectCommand(cmd: string): { safe: boolean; reason?: string } {
    if (!cmd || typeof cmd !== 'string') {
      return { safe: false, reason: 'Command must be a non-empty string.' };
    }

    const trimmed = cmd.trim();

    for (const item of DANGEROUS_COMMAND_PATTERNS) {
      if (item.pattern.test(trimmed)) {
        return {
          safe: false,
          reason: item.reason,
        };
      }
    }

    return { safe: true };
  }

  /**
   * Scrubs API keys, passwords, bearer tokens, and secrets from strings and objects.
   * Ensures audit logs never expose private credentials.
   */
  public static scrubSecrets(input: string): string {
    if (!input || typeof input !== 'string') return input;

    let clean = input;

    // Remove Bearer tokens
    clean = clean.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer ***TOKEN_SCRUBBED***');

    // Remove Google Gemini keys
    clean = clean.replace(/AIza[0-9A-Za-z\-_]{20,50}/g, 'AIza***KEY_SCRUBBED***');
    clean = clean.replace(/(?:key|apiKey|api_key)=([A-Za-z0-9_\-]+)/gi, 'key=***KEY_SCRUBBED***');

    // Remove OpenAI / OpenRouter sk- keys
    clean = clean.replace(/sk-[A-Za-z0-9\-_]{20,}/g, 'sk-***KEY_SCRUBBED***');

    // Remove Anthropic keys
    clean = clean.replace(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'sk-ant-***KEY_SCRUBBED***');

    // Remove password=... or secret=... query parameters or JSON fields
    clean = clean.replace(/(["']?(?:password|token|secret|apiKey|api_key)["']?\s*[:=]\s*["']?)([^"'&,\s]+)(["']?)/gi, '$1***CONFIDENTIAL***$3');

    return clean;
  }

  /**
   * Sanitizes payload object to ensure no nested secrets are logged.
   */
  public static sanitizeData<T>(data: T): T {
    if (!data) return data;
    try {
      const serialized = JSON.stringify(data);
      const scrubbed = this.scrubSecrets(serialized);
      return JSON.parse(scrubbed);
    } catch {
      return data;
    }
  }
}
