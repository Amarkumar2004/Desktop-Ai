# SUSI AI production audit — 2026-11-02

Repository: `Amarkumar2004/Desktop-Ai`
Base reviewed: `f770b04d004ed246afdf81ccc05f34ac51957350`
Working branch: `fix/susi-ai-production-hardening-20261102`

This is a source-code review, not a claim that the installed Windows application has passed runtime testing.

## Confirmed findings

| Area | Finding | Status |
|---|---|---|
| Provider credentials | Browser fallback returned success even though no persistent secure store existed. The save path then scrubbed the key from localStorage, so a reload lost the credential while the UI could report success. | Fixed in this branch: fail closed when Tauri Credential Manager is unavailable; verify the native save result before reporting success. |
| Authentication | `AuthContext` creates a demo `DEFAULT_USER` and restores localStorage as a session when Supabase has no session. Login/signup also have local-only success paths. This is not real identity authentication and must not protect server resources. | Open — requires coordinated UI/auth-flow migration and regression tests. |
| Terminal action contract | `ToolExecutor` posts `EXECUTE_COMMAND` to `/api/local/action`, but the route's Zod action enum does not include that value. | Open — do not simply add the enum value; the route currently lacks a verified, safely scoped execution handler. |
| Cancellation | `TaskOrchestrator` creates an `AbortController`, but `ActionPipeline.dispatch` and `ToolExecutor.execute` do not accept/pass its signal. Pipeline cancellation changes tracked state but cannot guarantee the underlying OS operation stops. | Open — needs end-to-end cancellation support and action-specific cancellation semantics. |
| Task progress | Orchestrator assigns a fixed 25% at start and 100% at completion. It does not reflect actual work within a step. | Open — progress should be reported by the executor/native bridge, not fabricated. |
| Native bridge | Rust exposes a useful set of Tauri commands, including system metrics, app scan, PC actions, and Windows Credential Manager. This source review does not prove each command works on the user's Windows machine. | Runtime verification required. |
| Packaging | `src-tauri/tauri.conf.json` sets `distDir` to `http://localhost:3000`. This is a URL rather than a packaged frontend asset directory and is suspicious for a production bundle. The app also has Next API routes, so a static-export replacement cannot be assumed safe. | Open — packaging architecture must be decided and an actual Windows installer build tested before changing this. |
| Database/RLS | The production migration creates ten tables and enables RLS. A second migration grants anonymous access to desktop task/log rows; anonymous shared rows need a deliberate isolation model and security review. | Open — test policies against anon and authenticated roles in a disposable Supabase project before changing production policies. |
| Local action API | The Next route still contains Node/Windows process execution code. This duplicates the Tauri native execution path and creates divergent security behavior. | Open — consolidate the execution boundary; do not remove existing functionality until parity tests exist. |

## Verification boundary

The GitHub connector can inspect and commit source, but it cannot execute this repository's npm scripts, compile the Rust/Tauri application, access the user's Supabase project, or operate the user's Windows desktop. No build, unit-test, E2E, microphone, volume, app-launch, or installer result is claimed by this document.

## Next verification work

1. Add focused unit tests for provider credential storage behavior in browser and Tauri modes.
2. Remove fake authentication success and ensure protected APIs validate a real Supabase session.
3. Define one typed action contract shared by planner, pipeline, Next route, and Rust bridge.
4. Implement cancellation propagation and dependent-task terminal states.
5. Test RLS policies with separate anon/authenticated test identities.
6. Build and launch the packaged Windows installer on a real Windows host.
