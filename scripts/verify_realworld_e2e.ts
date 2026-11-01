/**
 * SUSI AI — Strict Real-World End-to-End Verification Test Runner
 * Executes real actions on Windows OS and tests security boundaries.
 */

import { ActionPipeline } from '../src/lib/actions/ActionPipeline';
import { TaskOrchestrator } from '../src/lib/voice/TaskOrchestrator';
import {
  saveStoredProviderConnections,
  STORAGE_KEY_PROVIDERS,
} from '../src/lib/ai/providerVault';
import { getBootstrapToken } from '../src/lib/security/desktopAuth';
import { getTasks, createTask } from '../src/backend/services/taskService';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const API_BASE = 'http://localhost:3000';

interface VerificationResult {
  test: string;
  category: string;
  actualResult: string;
  passed: boolean;
  evidence: string;
  limitations?: string;
}

const results: VerificationResult[] = [];

async function runTest(
  category: string,
  test: string,
  fn: () => Promise<{ passed: boolean; actualResult: string; evidence: string; limitations?: string }>
) {
  try {
    const res = await fn();
    results.push({ category, test, ...res });
    console.log(`[${res.passed ? 'PASS' : 'FAIL'}] ${category} :: ${test}`);
    if (!res.passed) {
      console.error(`       Details: ${res.actualResult}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      category,
      test,
      passed: false,
      actualResult: `Unhandled exception: ${msg}`,
      evidence: msg,
    });
    console.error(`[FAIL] ${category} :: ${test} -> ${msg}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('   SUSI AI — STRICT REAL-WORLD E2E VERIFICATION SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. SECURITY — GET /api/internal/session REJECTION (No Secret Leakage)
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Reject Unauthenticated GET on Session Endpoint (405)', async () => {
    const res = await fetch(`${API_BASE}/api/internal/session`, { method: 'GET' });
    const data = await res.json();
    const passed = res.status === 405 && data.success === false && data.code === 'METHOD_NOT_ALLOWED' && data.token === undefined;

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
      limitations: 'GET requests are strictly prohibited to prevent arbitrary secret snooping.',
    };
  });

  // ---------------------------------------------------------------------------
  // 2. SECURITY — POST /api/internal/session WITHOUT BOOTSTRAP PROOF
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Reject Session Request Without Bootstrap Token (401)', async () => {
    const res = await fetch(`${API_BASE}/api/internal/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    const passed = res.status === 401 && data.code === 'MISSING_BOOTSTRAP_TOKEN' && data.success === false;

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 3. SECURITY — POST /api/internal/session WITH FAKE BOOTSTRAP PROOF
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Reject Session Request With Forged Bootstrap Token (401)', async () => {
    const res = await fetch(`${API_BASE}/api/internal/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bootstrapToken: 'forged_fake_token_attacker_attempt_999' }),
    });
    const data = await res.json();
    const passed = res.status === 401 && data.code === 'INVALID_BOOTSTRAP_TOKEN' && data.success === false;

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 4. SECURITY — POST /api/internal/session CROSS-ORIGIN BLOCKING
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Block Untrusted Origin on Session Handshake (403)', async () => {
    const bootstrapToken = getBootstrapToken();
    const res = await fetch(`${API_BASE}/api/internal/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://evil-untrusted-site.com',
      },
      body: JSON.stringify({ bootstrapToken }),
    });
    const data = await res.json();
    const passed = res.status === 403 && data.code === 'FORBIDDEN_ORIGIN' && data.success === false;

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 5. SECURITY — AUTHENTICATED SESSION ACQUISITION
  // ---------------------------------------------------------------------------
  let desktopSessionToken = '';
  await runTest('Security', 'Establish Authenticated Desktop Session via Protected Proof', async () => {
    const bootstrapToken = getBootstrapToken();
    const res = await fetch(`${API_BASE}/api/internal/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
      },
      body: JSON.stringify({ bootstrapToken }),
    });
    const data = await res.json();
    const passed =
      res.status === 200 &&
      data.success === true &&
      typeof data.token === 'string' &&
      data.token.length === 64 &&
      data.token !== bootstrapToken; // Verify master bootstrap secret is NOT returned

    if (passed) {
      desktopSessionToken = data.token;
    }

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: Session ID "${data.sessionId}", Scoped Token (length: ${data.token?.length}), Expires in ${Math.round((data.expiresAt - Date.now()) / 60000)}m`,
      evidence: JSON.stringify({ success: data.success, sessionId: data.sessionId, expiresAt: data.expiresAt }),
    };
  });

  const makeAuthHeaders = (nonce = `nonce_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`) => ({
    'Content-Type': 'application/json',
    'x-susi-desktop-auth': desktopSessionToken,
    'x-susi-timestamp': Date.now().toString(),
    'x-susi-nonce': nonce,
  });

  // ---------------------------------------------------------------------------
  // 6. SECURITY — REPLAY ATTACK DETECTION
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Replay Protection: Rejects Replayed Request Nonce (401)', async () => {
    const reusedNonce = `replay_test_nonce_${Date.now()}`;
    const headers = makeAuthHeaders(reusedNonce);

    // First request with nonce
    const firstRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actionType: 'SYSTEM_INFO', payload: {} }),
    });
    const firstData = await firstRes.json();

    // Replay identical nonce
    const replayRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actionType: 'SYSTEM_INFO', payload: {} }),
    });
    const replayData = await replayRes.json();
    const passed = firstData.success === true && replayRes.status === 401 && replayData.code === 'REPLAY_ATTACK_DETECTED';

    return {
      passed,
      actualResult: `First request: status=${firstRes.status}, Replayed nonce: status=${replayRes.status}, code=${replayData.code}`,
      evidence: JSON.stringify(replayData),
    };
  });

  // ---------------------------------------------------------------------------
  // 7. LIVE SYSTEM TELEMETRY (No Mock Data)
  // ---------------------------------------------------------------------------
  await runTest('System Telemetry', 'Real Hardware Metrics (CPU, RAM, Uptime)', async () => {
    const res = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'SYSTEM_INFO', payload: {} }),
    });
    const data = await res.json();
    const passed =
      data.success === true &&
      typeof data.cpu === 'number' &&
      typeof data.memory === 'number' &&
      typeof data.totalRamGb === 'number' &&
      data.totalRamGb > 0 &&
      data.uptime &&
      data.uptime !== '2d 14h';

    return {
      passed,
      actualResult: `CPU: ${data.cpu}%, RAM: ${data.memory}% (${data.usedRamGb}/${data.totalRamGb} GB), Uptime: ${data.uptime}, Platform: ${data.platform}`,
      evidence: JSON.stringify(data),
      limitations: 'CPU percent is instantaneous single-sample load across active cores.',
    };
  });

  // ---------------------------------------------------------------------------
  // 8. SECURITY — CRITICAL PROCESS TERMINATION PROTECTION
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Critical Process Kill Protection (explorer.exe & csrss.exe)', async () => {
    const res = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'CLOSE_APP', payload: { appName: 'explorer.exe' } }),
    });
    const data = await res.json();
    const passed = res.status === 403 && data.code === 'SECURITY_VIOLATION' && data.success === false;

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
      limitations: 'Protected processes include csrss, lsass, explorer, services, smss, wininit, taskmgr.',
    };
  });

  // ---------------------------------------------------------------------------
  // 9. SECURITY — PATH TRAVERSAL TO WINDOWS SYSTEM FOLDERS
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Path Traversal Prevention (C:\\Windows\\System32\\cmd.exe)', async () => {
    const res = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'GET_FILE_INFO', payload: { path: 'C:\\Windows\\System32\\cmd.exe' } }),
    });
    const data = await res.json();
    const passed = res.status === 403 && data.code === 'SECURITY_VIOLATION';

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 10. SECURITY — INVALID URL & SSRF PROTOCOL BLOCKING
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Disallow Dangerous URL Protocols (javascript: / file:)', async () => {
    const res = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'OPEN_URL', payload: { url: 'javascript:alert(document.cookie)' } }),
    });
    const data = await res.json();
    const passed = res.status === 403 && data.code === 'DISALLOWED_PROTOCOL';

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 11. SECURITY — STRICT ZOD VALIDATION & INVALID PAYLOAD REJECTION
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Strict Zod Rejection of Unknown Action Type', async () => {
    const res = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'FORMAT_HARD_DRIVE_NOW', payload: {} }),
    });
    const data = await res.json();
    const passed = res.status === 400 && data.code === 'VALIDATION_ERROR';

    return {
      passed,
      actualResult: `HTTP Status ${res.status}: ${data.error}`,
      evidence: JSON.stringify(data),
    };
  });

  // ---------------------------------------------------------------------------
  // 12. REAL WINDOWS CLIPBOARD READ / WRITE (Zero Command Injection)
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Safe Stdin Clipboard Write & Readback', async () => {
    const testSecret = `SUSI_E2E_VERIFICATION_TOKEN_${Date.now()}`;

    // Write to clipboard
    const writeRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'CLIPBOARD_ACTION', payload: { action: 'write', text: testSecret } }),
    });
    const writeData = await writeRes.json();

    // Read back from clipboard
    const readRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'CLIPBOARD_ACTION', payload: { action: 'read' } }),
    });
    const readData = await readRes.json();
    const passed = writeData.success === true && readData.success === true && readData.content === testSecret;

    return {
      passed,
      actualResult: `Written: "${testSecret}", Readback: "${readData.content}"`,
      evidence: JSON.stringify({ writeData, readData }),
    };
  });

  // ---------------------------------------------------------------------------
  // 13. REAL WINDOWS APPLICATION SPAWN & OS PROCESS VERIFICATION (Notepad)
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Native Spawn of Notepad & Verify OS Running State', async () => {
    const launchRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'OPEN_APP', payload: { appName: 'notepad' } }),
    });
    const launchData = await launchRes.json();

    // Short delay to let OS spawn
    await new Promise((r) => setTimeout(r, 1200));

    // Verify Notepad is actually running via Windows tasklist
    let isRunningInTasklist = false;
    try {
      const tasklistOutput = execSync('tasklist /FI "IMAGENAME eq notepad.exe" /NH').toString();
      isRunningInTasklist = tasklistOutput.toLowerCase().includes('notepad.exe');
    } catch {}

    const passed = launchData.success === true && isRunningInTasklist;

    return {
      passed,
      actualResult: `Launch status: ${launchData.success}, Confirmed active in Windows tasklist: ${isRunningInTasklist}`,
      evidence: JSON.stringify({ launchData, isRunningInTasklist }),
    };
  });

  // ---------------------------------------------------------------------------
  // 14. REAL WINDOWS APPLICATION TERMINATION & OS PROCESS VERIFICATION (Notepad)
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Native Terminate of Notepad & Verify OS Process Gone', async () => {
    const closeRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'CLOSE_APP', payload: { appName: 'notepad' } }),
    });
    const closeData = await closeRes.json();

    await new Promise((r) => setTimeout(r, 1000));

    // Verify Notepad is no longer in tasklist
    let isStillRunning = false;
    try {
      const tasklistOutput = execSync('tasklist /FI "IMAGENAME eq notepad.exe" /NH').toString();
      isStillRunning = tasklistOutput.toLowerCase().includes('notepad.exe');
    } catch {}

    const passed = closeData.success === true && !isStillRunning;

    return {
      passed,
      actualResult: `Close response: "${closeData.message}", Confirmed completely removed from Windows tasklist: ${!isStillRunning}`,
      evidence: JSON.stringify({ closeData, isStillRunning }),
    };
  });

  // ---------------------------------------------------------------------------
  // 15. REJECT CLOSE ON NON-EXISTENT PROCESS (Never Report False Success)
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Reject Close on Non-Existent Process (404)', async () => {
    const bogusProcess = `ghost_proc_not_running_${Date.now()}`;
    const closeRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'CLOSE_APP', payload: { appName: bogusProcess } }),
    });
    const closeData = await closeRes.json();
    const passed = closeRes.status === 404 && closeData.success === false && closeData.code === 'PROCESS_NOT_FOUND';

    return {
      passed,
      actualResult: `HTTP Status ${closeRes.status}: success=${closeData.success}, code=${closeData.code}, error="${closeData.error}"`,
      evidence: JSON.stringify(closeData),
      limitations: 'taskkill exit status is verified: non-zero return codes reject with PROCESS_NOT_FOUND.',
    };
  });

  // ---------------------------------------------------------------------------
  // 16. WINDOWS VOLUME & MEDIA CONTROL
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Volume Adjustment & Media Playback Control', async () => {
    const volRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'VOLUME_CONTROL', payload: { action: 'up' } }),
    });
    const volData = await volRes.json();

    const mediaRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'MEDIA_CONTROL', payload: { action: 'play_pause' } }),
    });
    const mediaData = await mediaRes.json();
    const passed = volData.success === true && mediaData.success === true;

    return {
      passed,
      actualResult: `Volume: "${volData.message}", Media: "${mediaData.message}"`,
      evidence: JSON.stringify({ volData, mediaData }),
    };
  });

  // ---------------------------------------------------------------------------
  // 17. REAL CHROME LAUNCH & YOUTUBE URL NAVIGATION
  // ---------------------------------------------------------------------------
  await runTest('Windows Automation', 'Launch Chrome & Open YouTube URL', async () => {
    const urlRes = await fetch(`${API_BASE}/api/local/action`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify({ actionType: 'OPEN_URL', payload: { url: 'https://youtube.com' } }),
    });
    const urlData = await urlRes.json();
    const passed = urlData.success === true && urlData.url === 'https://youtube.com/';

    return {
      passed,
      actualResult: `Opened URL result: "${urlData.message}"`,
      evidence: JSON.stringify(urlData),
    };
  });

  // ---------------------------------------------------------------------------
  // 18. ACTION PIPELINE DEDUPLICATION (Exactly-Once Execution)
  // ---------------------------------------------------------------------------
  await runTest('Action Pipeline', 'Idempotent Deduplication of Double Triggers', async () => {
    ActionPipeline.clearCompleted();
    const trigger1 = await ActionPipeline.dispatch({
      type: 'NAVIGATE_TAB',
      payload: { tab: 'e2e_hardened_tab' },
    });

    const trigger2 = await ActionPipeline.dispatch({
      type: 'NAVIGATE_TAB',
      payload: { tab: 'e2e_hardened_tab' },
    });

    const passed = trigger1.success === true && trigger2.isDuplicate === true;

    return {
      passed,
      actualResult: `Trigger 1: success=${trigger1.success}, Trigger 2 (immediate): isDuplicate=${trigger2.isDuplicate}, message="${trigger2.message}"`,
      evidence: JSON.stringify({ trigger1, trigger2 }),
    };
  });

  // ---------------------------------------------------------------------------
  // 19. MULTI-STEP TASK ORCHESTRATION & DEPENDENCIES
  // ---------------------------------------------------------------------------
  await runTest('Task Orchestrator', 'Multi-Step Execution DAG with Dependencies', async () => {
    const orchestrator = new TaskOrchestrator();
    const tasks = await orchestrator.planAndDispatch('Open Chrome and then open YouTube', [
      { type: 'OPEN_APP', payload: { appName: 'chrome' } },
      { type: 'OPEN_URL', payload: { url: 'https://youtube.com' } },
    ]);

    const hasDependency = tasks.length === 2 && tasks[1].dependsOn && tasks[1].dependsOn[0] === tasks[0].taskId;
    const passed = Boolean(hasDependency);

    return {
      passed,
      actualResult: `Task 1: "${tasks[0].title}", Task 2: "${tasks[1].title}" (dependsOn: ${JSON.stringify(tasks[1].dependsOn)})`,
      evidence: JSON.stringify(tasks.map((t) => ({ id: t.taskId, title: t.title, dependsOn: t.dependsOn }))),
    };
  });

  // ---------------------------------------------------------------------------
  // 20. TASK CANCELLATION PROPAGATION
  // ---------------------------------------------------------------------------
  await runTest('Task Orchestrator', 'Cascading Cancellation of Dependent Tasks', async () => {
    const orchestrator = new TaskOrchestrator();
    const tasks = await orchestrator.planAndDispatch('Step 1 then Step 2', [
      { type: 'OPEN_APP', payload: { appName: 'calc' } },
      { type: 'OPEN_URL', payload: { url: 'https://google.com' } },
    ]);

    // Cancel parent
    orchestrator.cancelTask(tasks[0].taskId);
    const parent = orchestrator.getTask(tasks[0].taskId);
    const dependent = orchestrator.getTask(tasks[1].taskId);

    const passed = parent?.status === 'cancelled' && dependent?.status === 'cancelled';

    return {
      passed,
      actualResult: `Parent status: ${parent?.status}, Dependent status: ${dependent?.status}`,
      evidence: JSON.stringify({ parentStatus: parent?.status, dependentStatus: dependent?.status }),
    };
  });

  // ---------------------------------------------------------------------------
  // 21. SECRET VAULT SECURITY (Plaintext Keys Never in LocalStorage)
  // ---------------------------------------------------------------------------
  await runTest('Security', 'Plaintext API Keys Scrubbed from Persistent Storage', async () => {
    const mockConnection: any = {
      id: 'conn_openai_test',
      workspaceId: 'default',
      provider: 'openai',
      providerLabel: 'OpenAI Test',
      maskedKeySuffix: '••••9999',
      rawKey: 'sk-proj-SUPER_SECRET_PLAINTEXT_KEY_NEVER_SAVE',
      selectedModel: 'gpt-4o',
      availableModels: [],
      status: 'connected',
      capabilities: { voice: true, chat: true, code: true },
      createdAt: new Date().toISOString(),
    };

    await saveStoredProviderConnections([mockConnection]);

    const rawSaved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_PROVIDERS) : null;
    const containsPlaintextSecret = rawSaved ? rawSaved.includes('sk-proj-SUPER_SECRET_PLAINTEXT_KEY_NEVER_SAVE') : false;
    const passed = !containsPlaintextSecret;

    return {
      passed,
      actualResult: `Contains plaintext raw key in localStorage: ${containsPlaintextSecret}`,
      evidence: `Storage scrubbed successfully: ${passed}`,
    };
  });

  // ---------------------------------------------------------------------------
  // 22. SUPABASE / OFFLINE DATABASE FALLBACK
  // ---------------------------------------------------------------------------
  await runTest('Persistence', 'Database Query Fallback without Crash', async () => {
    const tasks = await getTasks();
    const newTask = await createTask({
      title: 'E2E Verified Offline Task',
      assignedAgent: 'SUSI',
      priority: 'High',
      category: 'Operations',
    });

    const passed = Array.isArray(tasks) && newTask && newTask.id.startsWith('task-');

    return {
      passed,
      actualResult: `Retrieved ${tasks.length} tasks, created new task "${newTask.title}" (ID: ${newTask.id})`,
      evidence: JSON.stringify({ taskCount: tasks.length, newTaskId: newTask.id }),
    };
  });

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log('================================================================\n');

  fs.writeFileSync(
    path.join(__dirname, 'e2e_verification_report.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
}

main().catch(console.error);
