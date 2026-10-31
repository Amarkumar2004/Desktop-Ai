/**
 * Action Classifier & Risk Evaluator
 * Classifies operations into LOW, MEDIUM, and HIGH risk tiers based on action type,
 * targets, and command inspection. Generates voice prompts in Hindi and English.
 */

import { ActionClassificationResult, RiskLevel } from './types';
import { SecurityValidator } from './securityValidator';

export class ActionClassifier {
  /**
   * Evaluates any action and its payload to determine risk tier and confirmation requirements.
   */
  public static classify(
    actionType: string,
    payload: Record<string, unknown> = {}
  ): ActionClassificationResult {
    const actionUpper = (actionType || '').toUpperCase().trim();
    const target = String(payload.target || payload.filename || payload.path || payload.command || payload.url || 'system');

    // 1. Run security validator on target path and command
    const pathCheck = SecurityValidator.isDangerousPath(target);
    if (pathCheck.dangerous) {
      return {
        riskLevel: 'HIGH',
        requiresApproval: true,
        isReversible: false,
        component: 'Windows System Core',
        reason: pathCheck.reason || 'Operation targets critical OS files.',
        consequences: 'WARNING: Attempting to modify or delete core Windows operating system files may corrupt the OS.',
        voicePromptHi: 'Yeh action system files ko affect karega. Kya aap sach mein iski ijazat dete hain?',
        voicePromptEn: 'This action affects critical system files. Are you sure you want to authorize this?',
        isBlocked: true,
        blockedReason: pathCheck.reason,
      };
    }

    if (payload.command && typeof payload.command === 'string') {
      const cmdCheck = SecurityValidator.inspectCommand(payload.command);
      if (!cmdCheck.safe) {
        return {
          riskLevel: 'HIGH',
          requiresApproval: true,
          isReversible: false,
          component: 'Windows Terminal / PowerShell',
          reason: cmdCheck.reason || 'Destructive command signature detected.',
          consequences: 'BLOCKED: This command contains unsafe system alteration signatures.',
          voicePromptHi: 'Yeh command bohot khatarnak hai aur system ko damage kar sakta hai. Isse rok diya gaya hai.',
          voicePromptEn: 'This command is classified as destructive and has been blocked.',
          isBlocked: true,
          blockedReason: cmdCheck.reason,
        };
      }
    }

    // 2. Classify based on actionType
    switch (actionUpper) {
      // -------------------------------------------------------------
      // LOW RISK — Automatic Execution
      // -------------------------------------------------------------
      case 'OPEN_URL':
      case 'NAVIGATE_TAB':
      case 'SYSTEM_INFO':
      case 'RUN_DIAGNOSTICS':
      case 'CREATE_TASK':
      case 'READ_FILE':
      case 'CHAT_REPLY':
        return {
          riskLevel: 'LOW',
          requiresApproval: false,
          isReversible: true,
          component: 'Application Interface',
          reason: 'Standard navigation or information retrieval.',
          consequences: 'Standard read-only or navigational action. No files will be modified.',
          voicePromptHi: 'Kya main aage badhoon?',
          voicePromptEn: 'Proceed with standard action?',
        };

      case 'CREATE_FILE':
        // If file already exists, it becomes overwrite (medium risk)
        if (payload.exists === true || payload.isOverwrite === true) {
          return {
            riskLevel: 'MEDIUM',
            requiresApproval: true,
            isReversible: false,
            component: 'Workspace File System',
            reason: `Existing file "${target}" will be overwritten.`,
            consequences: 'The previous contents of this file will be replaced with new content.',
            voicePromptHi: `Kya main "${target}" file ko overwrite kar doon?`,
            voicePromptEn: `Should I overwrite the existing file "${target}"?`,
          };
        }
        return {
          riskLevel: 'LOW',
          requiresApproval: false,
          isReversible: true,
          component: 'Workspace File System',
          reason: 'Creating a new template or generated file in workspace.',
          consequences: 'A new file will be added to the project without modifying existing files.',
          voicePromptHi: `Kya main nayi file "${target}" create kar doon?`,
          voicePromptEn: `Should I create the new file "${target}"?`,
        };

      // -------------------------------------------------------------
      // MEDIUM RISK — Confirmation Required
      // -------------------------------------------------------------
      case 'DELETE_FILE':
      case 'DELETE_FOLDER': {
        const sizeInfo = payload.fileSize ? ` (${payload.fileSize})` : '';
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: true, // Safe delete moves to Windows Recycle Bin!
          component: 'Windows File System',
          reason: `Requested deletion of file "${target}"${sizeInfo}.`,
          consequences: 'The item will be moved to the Windows Recycle Bin. You can restore it if needed.',
          voicePromptHi: `Kya main "${target}" ko Recycle Bin mein bhej doon?`,
          voicePromptEn: `May I move "${target}" to the Recycle Bin?`,
        };
      }

      case 'OVERWRITE_FILE':
      case 'MODIFY_FILE':
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: false,
          component: 'Workspace File System',
          reason: `Modifying contents of existing file "${target}".`,
          consequences: 'Existing code or data in this file will be updated.',
          voicePromptHi: `Kya main "${target}" file mein changes apply kar doon?`,
          voicePromptEn: `May I apply modifications to "${target}"?`,
        };

      case 'MOVE_FILE':
      case 'RENAME_FILE':
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: true,
          component: 'Workspace File System',
          reason: `Moving/renaming "${target}" to "${payload.destination || 'new location'}".`,
          consequences: 'The file path will change which might affect references or imports.',
          voicePromptHi: `Kya main file ko move kar doon?`,
          voicePromptEn: `May I move this file to the new location?`,
        };

      case 'INSTALL_PACKAGE':
      case 'UNINSTALL_PACKAGE':
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: true,
          component: 'Package Manager (npm/yarn)',
          reason: `${actionUpper === 'INSTALL_PACKAGE' ? 'Installing' : 'Uninstalling'} package "${target}".`,
          consequences: 'Will modify package.json and update project dependencies in node_modules.',
          voicePromptHi: `Kya main "${target}" package install kar doon?`,
          voicePromptEn: `Should I proceed with installing package "${target}"?`,
        };

      case 'EXECUTE_COMMAND':
      case 'TERMINAL_COMMAND':
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: false,
          component: 'Windows Terminal / PowerShell',
          reason: `Running terminal command: ${payload.command || target}`,
          consequences: 'The command will be executed in your local development environment.',
          voicePromptHi: `Kya main yeh command execute kar sakta hoon?`,
          voicePromptEn: `May I run this terminal command?`,
        };

      case 'MODIFY_ENV':
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: false,
          component: 'Environment Configuration',
          reason: `Modifying environment variable "${target}".`,
          consequences: 'Environment values will be altered which may change application behavior.',
          voicePromptHi: `Kya main environment settings update kar doon?`,
          voicePromptEn: `May I update the environment variable "${target}"?`,
        };

      // -------------------------------------------------------------
      // HIGH RISK — Strong Confirmation / Warning Required
      // -------------------------------------------------------------
      case 'REGISTRY_MODIFY':
      case 'MODIFY_REGISTRY':
        return {
          riskLevel: 'HIGH',
          requiresApproval: true,
          isReversible: false,
          component: 'Windows Registry',
          reason: `Registry key alteration requested: ${target}`,
          consequences: 'CRITICAL: Modifying the Windows Registry can cause system instability.',
          voicePromptHi: 'Windows Registry modify karne ki koshish ki gayi hai. Kya aap confirm karte hain?',
          voicePromptEn: 'A Windows Registry modification is requested. Do you strongly authorize this?',
        };

      case 'FORMAT_DRIVE':
        return {
          riskLevel: 'HIGH',
          requiresApproval: true,
          isReversible: false,
          component: 'Storage Disk Subsystem',
          reason: 'Drive formatting operation.',
          consequences: 'CATASTROPHIC: All data on the target drive will be permanently erased.',
          voicePromptHi: 'Drive format karne ka request aaya hai. Yeh bilkul mana hai!',
          voicePromptEn: 'Drive formatting requested. This is critically destructive!',
          isBlocked: true,
          blockedReason: 'Formatting drives is prohibited by safety policy.',
        };

      case 'DISABLE_SECURITY':
        return {
          riskLevel: 'HIGH',
          requiresApproval: true,
          isReversible: false,
          component: 'Windows Defender / Firewall',
          reason: 'Security sub-system disable requested.',
          consequences: 'CRITICAL: Disabling Windows security exposes your computer to malware.',
          voicePromptHi: 'Security disable karne ka request aaya hai. Isse rok diya gaya hai.',
          voicePromptEn: 'Disabling security software is strictly blocked.',
          isBlocked: true,
          blockedReason: 'Disabling security software is strictly prohibited.',
        };

      default:
        // Any unknown action defaults to MEDIUM risk (require confirmation)
        return {
          riskLevel: 'MEDIUM',
          requiresApproval: true,
          isReversible: false,
          component: 'General System',
          reason: `Unrecognized action "${actionType}" requested.`,
          consequences: 'Unrecognized action. Permission is required before execution.',
          voicePromptHi: `Kya main "${actionType}" action execute kar sakta hoon?`,
          voicePromptEn: `May I execute action "${actionType}"?`,
        };
    }
  }
}
