# Workbench corrections — 2026-09-19

Fixes are based on frontend commit `1422637`. The separate backend integration is being developed concurrently; these changes were verified in an isolated checkout.

## Corrected behavior

- Adding files retains existing attachments. Combined file count, byte size and duplicate names are checked before changing the attachment list.
- New benchmark resets the uploader and invalidates pending reads. A delayed file read cannot reattach a file after reset; upload errors are cleared.
- Opening the demo or candidate example keeps the user's draft and attachments. The composed payload is stored in the run snapshot rather than written back into the editable text field, preventing attachments from being duplicated in subsequent submissions.
- Provider indicators distinguish unchecked, checking, connected, unconfigured, provider error and failed status lookup. Repeated clicks cannot start overlapping checks.
- An active or failed run without measurements has the corresponding message instead of being called unexecuted. Predictions remain excluded from performance charts.
- Measured chart data is memoized so tooltip changes do not rebuild the WebGL scene.
- A completed background poll only redirects the benchmark screen; it does not pull users out of the input or provider screens.
- Playwright accepts `PLAYWRIGHT_PORT` (default 5173), allowing independent checkouts to be verified without using another task's dev server.

## Verification

- Original test suite: 10 browser tests passed before investigation.
- Reproduced three regressions before fixing them: second attachment replaced the first, a delayed read restored a reset attachment, and unchecked providers appeared disconnected.
- Final isolated checkout: **15 unit tests, 13 browser tests, TypeScript check and production build passed**.
- The same 13 browser tests also passed against the production build on port 5185. All five bundled DM Sans / IBM Plex Mono font faces loaded successfully. This extra check bypassed a development-only font allow-list issue caused by the isolated checkout sharing installed dependencies.
- Browser coverage includes initial evidence gating, candidate screening, demo selection/export/reset, 2D/3D and WebGL fallback, mobile layout, provider outages, uploads and the new regressions.
- Browser check of provider cards confirms the initial status is “확인 전”.
- No model inference, cloud benchmark or deployment was performed as part of this UI correction.

Commands (run from this checkout):

```powershell
pnpm test
$env:PLAYWRIGHT_PORT = '5184'
pnpm test:e2e
pnpm build
```
