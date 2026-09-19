# Runtime / infrastructure ownership

The runtime work is isolated in `runtime-infra/` because frontend and engine sessions are editing this same workspace concurrently. Do not overwrite its package.json or source files. Runtime does not own the root package.json, tsconfig, frontend, or optimization engine.

Standalone HTTP server: `127.0.0.1:3001`.

- `GET /api/providers`: truthful provider statuses (no keys => NOT_CONFIGURED).
- `POST /api/benchmark/run`: `{provider?: "daytona", architecture: {id, agents: [{role, model}]}, benchmarkCase: {id, task, evaluator}}` => HTTP 202 job; `?wait=true` => terminal result.
- `GET /api/benchmark/runs/:id`: poll job status/history/result.
- `GET /api/benchmark/policy`: fixed token/time/sampling limits.
- `POST /api/benchmark/engine/run`: accepts engine `{architecture, benchmarkCase}` unchanged; maps agents in order, preserves source architecture hash and applies the real coding evaluator. Returns HTTP 202 and the usual status URL.
- `POST /api/benchmark/batch`: `{architectures: [...up to 3], benchmarkCases: [...up to 10]}` => HTTP 202 jobs.
- Model IDs: `qwen3-4b`, `deepseek-r1-distill-qwen-7b`, `gemma-3-4b`.
- Evaluators: `exact_match`, `contains_all`, `json_exact`, and `node_tests` (real JavaScript syntax check and trusted Node tests).
- States: QUEUED, PROVISIONING, PREPARING, RUNNING, EVALUATING, COMPLETED, FAILED.
- Missing credentials, missing cached models, or infrastructure failures never become fabricated MEASURED results.

The full contract and setup are in `runtime-infra/README.md`. This API is an independent service; use the frontend same-origin proxy. No frontend work is performed by the runtime session.

## Engine integration is available

The earlier string-only evaluator gap is resolved. `node_tests` returns `caseEvidence` with actual build/test exit statuses and passed/failed/skipped counts. Printed fake TAP is ignored; a trusted parent-process reporter collects Node test events. The adapter supports the engine's single-editable-file fixtures, `node --check <file>`, and `node --test --test-reporter=tap <trusted file>` (reporter replaced for reliable collection). Unsupported commands are rejected.

The user requires equivalent timeout/resources across competing architectures. Runtime defaults are 300 seconds, 512 tokens/agent, and the pinned snapshot resources. **The engine's compute request must match these exactly**; mismatches return `COMPUTE_POLICY_MISMATCH` before sandbox creation. For its current `standard` configuration, use a 4 CPU / 16 GiB snapshot and set `BENCHMARK_TIMEOUT_SECONDS=40`, `BENCHMARK_MAX_TOKENS=768`. Do not silently relabel measured runtime results as a different engine compute configuration. Compare only configurations sharing the same policy or explicitly start a different experiment.

Run every workload case, require actual `MEASURED` evidence and matching provenance, sum real `metrics.totalElapsedMs` for sequential full-workload latency, and call the engine's `createMeasuredResult` with each `caseEvidence` (omit the extra exit-status fields if desired). Keep cost/CPU/GPU/memory resource telemetry null. Aggregate workload orchestration and UI recommendation wiring remain in the caller. The runtime does not implement optimization logic.

Credentials appeared in `runtime-infra/.env` during implementation. **Live Daytona smoke PASSED**: create, createFolder, uploadFile, executeCommand, downloadFile, and confirmed deletion. Sandbox ID: `a89f90b2-73b6-41a3-9b46-98378f715019` (deleted). Daytona reports LIVE after a real API check. `DAYTONA_SNAPSHOT` and GGUF model files are still missing; real model inference and snapshot image build remain unverified. Nosana credentials are present but this adapter remains truthfully NOT_CONFIGURED because job execution is not implemented. See `runtime-infra/VALIDATION.md`.
