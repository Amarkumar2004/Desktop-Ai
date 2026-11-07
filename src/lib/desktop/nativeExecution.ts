export type NativeWorkspaceCheckAction = 'build' | 'test' | 'lint' | 'typecheck' | 'cargo_check';

export interface NativeWorkspaceCheckResult {
  success: boolean;
  action: NativeWorkspaceCheckAction;
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs a fixed native validation command only after a direct user confirmation.
 * The Rust command accepts no arbitrary executable or command-line arguments.
 */
export async function runWorkspaceCheckWithConfirmation(
  workspaceRoot: string,
  action: NativeWorkspaceCheckAction,
): Promise<NativeWorkspaceCheckResult | { cancelled: true }> {
  if (typeof window === 'undefined') {
    throw new Error('Native workspace checks can only run from the desktop client.');
  }
  const root = workspaceRoot.trim();
  if (!root) throw new Error('Select a workspace folder before running checks.');

  const approved = window.confirm(
    `Allow SUSI AI to run the ${action} check in this workspace?\\n\\n${root}\\n\\nOnly the built-in allowlisted command will run. No shell command or custom arguments are accepted.`,
  );
  if (!approved) return { cancelled: true };

  const tauriWindow = window as typeof window & {
    __TAURI__?: { invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T> };
  };
  let invoke = tauriWindow.__TAURI__?.invoke;
  if (!invoke) {
    try {
      const tauriApi = await import('@tauri-apps/api/tauri');
      invoke = tauriApi.invoke;
    } catch {
      throw new Error('Tauri native IPC is unavailable. Run this check inside the SUSI desktop app.');
    }
  }

  return invoke<NativeWorkspaceCheckResult>('run_workspace_check', {
    workspaceRoot: root,
    action,
    userConfirmed: true,
  });
}
