# Tauri v2 Desktop Preparation & Architecture Guide

This document outlines the security architecture, plugin configuration, and scoped permission model for migrating the SUSI AI platform into a secure **Tauri v2** native desktop application.

---

## 1. Security Principles & Non-Negotiable Constraints

1. **Zero Terminal / Shell Access**:
   - The `@tauri-apps/plugin-shell` plugin is **strictly disabled** and prohibited.
   - The desktop runtime will never execute arbitrary shell scripts, CLI commands, or child processes.
2. **Default Deny**:
   - All capabilities default to denied.
   - Permissions are granted on an explicit opt-in basis per user action.
3. **Strictly Scoped Filesystem Access**:
   - No unrestricted full-PC disk access.
   - Operations are confined exclusively to a user-selected project folder via native folder picker.
4. **Mandatory Human-in-the-Loop Approvals**:
   - Destructive file writes, deletions, and outbound messaging require a pre-generated single-use approval token with a 5-minute time-to-live (TTL).
5. **No Credential Leakage**:
   - Provider API keys and authentication secrets are stored in native desktop vaults/keyrings and never exposed to the frontend webview.

---

## 2. Future Tauri v2 Official Plugins

When ready for desktop compilation, the following official Tauri v2 plugins will be added:

| Plugin | Package | Purpose |
| :--- | :--- | :--- |
| **Filesystem** | `@tauri-apps/plugin-fs` | Scoped reading and writing of project files |
| **Browser Opener** | `@tauri-apps/plugin-opener` | Safe opening of external HTTPS URLs and search queries |
| **Notifications** | `@tauri-apps/plugin-notification` | Native OS desktop notification alerts |
| **Native Dialogs** | `@tauri-apps/plugin-dialog` | OS native folder picker (`selectProjectFolder`) |
| **Persisted Scope** | `@tauri-apps/plugin-persisted-scope` | Persisting user-approved folder permissions across restarts |

> **Note**: None of these dependencies are installed in this task. The web platform abstraction (`LocalActionService`) acts as a safe fallback returning `"Desktop app required"`.

---

## 3. Scoped `tauri.conf.json` Configuration Specification

In the future Tauri v2 desktop configuration, capabilities will be explicitly defined:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "SUSI AI Desktop",
  "version": "1.0.0",
  "identifier": "ai.susi.desktop",
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://generativelanguage.googleapis.com; img-src 'self' data: https:;"
    }
  },
  "plugins": {
    "fs": {
      "requireLiteralLeadingDot": true,
      "scope": {
        "allow": [
          "$HOME/Desktop/**/*",
          "$HOME/Documents/**/*",
          "$HOME/Projects/**/*",
          "$HOME/Code/**/*",
          "$HOME/my-app/**/*"
        ],
        "deny": [
          "$HOME/.ssh/**/*",
          "$HOME/.env",
          "$HOME/.env.*",
          "$HOME/.aws/**/*",
          "$HOME/.git/**/*",
          "$HOME/node_modules/**/*",
          "**/secrets/**/*",
          "**/credentials/**/*",
          "**/*.pem",
          "**/*.key",
          "/etc/**/*",
          "/var/**/*",
          "C:\\Windows\\**/*",
          "C:\\Program Files\\**/*"
        ]
      }
    },
    "opener": {
      "allow": [
        "https://*.google.com/**/*",
        "https://*.youtube.com/**/*",
        "https://github.com/**/*"
      ]
    },
    "shell": {
      "disabled": true
    }
  }
}
```

---

## 4. Approval & Audit Workflow

```
[ User Action / AI Request ]
            │
            ▼
[ validateScopedRelativePath() ]  ──(Invalid)──► [ Reject with SECURITY_VIOLATION ]
            │
         (Valid)
            ▼
[ requestLocalActionApproval() ]
            │
            ▼
[ Generate Single-Use Token (5 min TTL) ]
            │
            ▼
[ User Reviews Summary & Diff Modal in Desktop UI ]
            │
     ┌──────┴──────┐
     ▼             ▼
[ Rejected ]   [ Approved ]
                   │
                   ▼
       [ validateAndConsumeApproval() ]
                   │
                   ▼
       [ Execute Scoped Desktop Action via Tauri IPC ]
```

---

## 5. Summary of Local Capabilities

- `select_project_folder`: Open native dialog to pick working directory.
- `read_project_files`: Stream file contents within validated relative path.
- `write_project_files`: Apply file creations/modifications after approval.
- `delete_project_files`: Remove files within scoped folder after approval.
- `create_project_folders`: Create subfolders within scoped directory.
- `open_browser_url`: Safe external web browsing via system default browser.
- `open_youtube_search`: Direct YouTube query launcher.
- `show_desktop_notification`: Native OS notification toasts.
- `prepare_message_draft`: Draft outbound notification/message for user review.
- `send_approved_message`: Send confirmed message to external platform.
