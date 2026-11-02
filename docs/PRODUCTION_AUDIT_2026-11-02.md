# SUSI AI production audit — 2026-11-02

Repository: `Amarkumar2004/Desktop-Ai`
Working branch: `fix/susi-ai-production-hardening-20261102`

This is a source-code review, not a claim that the installed Windows application has passed runtime testing.

## Fixes committed on this branch
- Provider credential persistence now fails closed in browser mode when Windows Credential Manager is unavailable. API keys are not silently treated as persisted.
- Authentication now uses Supabase Auth sessions only. Demo-user/localStorage authentication fallbacks were removed; login/signup require Supabase and a password.
- Task cancellation signals are passed from TaskOrchestrator through ActionPipeline to ToolExecutor. The executor checks cancellation before starting an action; already-running native OS calls may not be interruptible.
- Removed the fixed 25% task-progress claim; progress remains 0 until the action completes because the current executor does not report granular progress.

## Confirmed findings still requiring work

| Area | Finding | Status |
|---|---|---|
| Terminal action contract | `ToolExecutor` posts `EXECUTE_COMMAND` to `/api/local/action`, but the route's Zod enum does not include it. | Open — keep blocked until a constrained command runner, explicit approval, workspace boundary, timeout, output limits and audit coverage are implemented. |
| Authentication backend | UI now rejects local fake sessions, but protected API routes must independently validate real Supabase user sessions wherever user data is accessed. | Open — audit all API handlers and RLS behavior. |
| Cancellation | Abort signal reaches the executor and prevents actions that have not started. Existing Tauri commands and some fetch operations cannot necessarily be interrupted once dispatched. | Partially improved; action-specific abort/readback remains. |
| Task dependencies | Failed prerequisites cancel direct pending dependents; multi-level dependency propagation and retries need tests. | Open — add graph-based tests. |
| Native bridge | Rust exposes system metrics, app scan, PC actions, and Credential Manager commands. This source review does not prove each command works on the user's Windows machine. | Runtime verification required. |
| Packaging | `src-tauri/tauri.conf.json` sets `distDir` to `http://localhost:3000`. This is a URL rather than packaged frontend assets and is suspicious for production. The app also has Next API routes, so a static-export replacement cannot be assumed safe. | Open — packaging architecture and actual Windows installer build required. |
| Database/RLS | Production migration creates ten tables and enables RLS. A separate migration grants anonymous access to desktop task/log rows; shared anonymous rows need a deliberate isolation model. | Open — test policies using anon and authenticated identities in a disposable Supabase project. |
| Local action API | Next route still contains Node/Windows process execution code, duplicating the Tauri native execution path. | Open — consolidate only after parity tests. |
| UI component functionality | Source presence does not prove all screens, buttons, flows, voice capture, provider integrations or desktop actions work. | Open — component inventory + browser and Windows E2E suite required. |

## Verification boundary
The GitHub connector can inspect and commit source, but it cannot execute repository npm scripts, compile Rust/Tauri, access the user's Supabase project, or operate the user's Windows desktop. No build, unit-test, E2E, microphone, volume, app-launch, or installer result is claimed here.

## Required verification
1. Run `npm ci`, `npm run lint`, `npm test`, and `npm run build` on CI.
2. Run `cargo check` / `cargo test` for the Tauri backend on Windows.
3. Add auth tests for signed-out, valid session, expired session, failed sign-in and email-confirmation flows.
4. Add cancellation tests for queued, running, failed and dependent tasks.
5. Test RLS with distinct anon/authenticated users.
6. Build and launch the packaged Windows installer and verify real app launch, volume readback, clipboard, screenshots, media controls and credential persistence.
