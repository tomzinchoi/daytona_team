# Validation — 2026-09-19

## Passed

- TypeScript/API/provider tests: **25/25** (`pnpm test`).
- Python runner tests: **8/8** (`python -m unittest discover -s test -p '*_test.py' -v`). These include actual local Node syntax checking and Node test execution, failing tests, syntax errors, and rejection of printed fake TAP evidence.
- Production TypeScript build: **passed** (`pnpm build`).
- Compiled production application over a real loopback HTTP socket: `/health` returned 200; intentionally empty configuration returned three NOT_CONFIGURED providers; synchronous run returned HTTP 503 / PROVIDER_NOT_CONFIGURED / NOT_AVAILABLE with null execution measurements.
- **Live Daytona smoke: PASSED** (`pnpm smoke:daytona`). Actual official SDK operations verified: sandbox creation, workspace creation, upload, Python command execution (6 × 7 asserted as 42), artifact download, and deletion with `wait=true`.
- Live smoke sandbox `a89f90b2-73b6-41a3-9b46-98378f715019`: **DELETED**, confirmed by SDK.
- Actual Daytona status read: **LIVE**. The configured account API is reachable and authenticated.

The initial smoke run was correctly SKIPPED because credentials were absent. Configuration appeared during this session; the later live run above supersedes that initial skip. Credentials were not printed or checked into source.

## Not yet verified

- `DAYTONA_SNAPSHOT` is not configured; no cached GGUF model files are present.
- Actual Qwen3 / DeepSeek / Gemma inference, real architecture benchmark scores, and model throughput: **not run**, no measurements claimed.
- Snapshot Docker image build: **not run**, no Docker daemon available in this workspace. The image recipe uses a pinned llama.cpp commit and the official SDK snapshot script compiles, but a real image build must be completed before model benchmarks.
- Nosana: credentials are present locally, but runtime job submission/collection/cleanup remains **NOT_CONFIGURED**. No successful Nosana run is claimed.
- DNSimple: no configured account token; **NOT_CONFIGURED**. No DNS changes were made.
- UI/full-workload recommendation orchestration: owned by the caller; runtime exposes the engine input adapter and real per-case coding evaluator.

## Test boundaries

Provider lifecycle unit tests use explicit SDK doubles; their synthetic artifacts are never exposed by the production provider. Real cloud operations are only those listed under the live smoke result. Real local Node evaluation tests use small repository-controlled programs, not models. Test fixture durations are not benchmark measurements.

Runtime queue is in memory, sequential, and bounded to 200 retained jobs. The process has no durable recovery. Auto-stop, auto-delete, and wall-clock TTL backstop cloud resource cleanup. Resource telemetry and cost remain null/unavailable.
