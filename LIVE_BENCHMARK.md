# Daytona full-workload verification

The original frontend's **Daytona 실측 워크로드 준비 → Daytona 벤치마크 시작** path was connected to real runtime orchestration. It never reads `src/data/demo.ts`. A subsequent user request restricts the public UI to the teammate's three active models (Gemma4 E2B, Qwen3.5 9B, GPT-OSS20B) and hides the original-model entry buttons. The original-model experiment remains separate diagnostic evidence, not a measurement of those new models.

## Reproducible lab

- Snapshot: `55ac80a8-14f4-4ba4-9928-c692764d3e83` (`atlas-lab-q4km-20260919-v1`), active.
- Account-compatible allocation: 4 CPU, 8 GiB RAM, 10 GiB disk, CPU inference only.
- Three public Q4_K_M GGUFs: Qwen3 4B, DeepSeek-R1-Distill-Qwen-7B, Gemma3 4B. Exact repository revisions, sizes, SHA-256 values are in `runtime-infra/models/sources.json`. Each download is checksum-verified during image build. Respect each upstream model's license/usage terms.
- llama.cpp commit: `b23701f77d47dad9de834d59ebfcbe25c9e8b46f`.
- Fixed policy: temperature 0, seed 42, context 4096, 1024 output tokens per agent, 300 seconds per case, concurrency 1.
- Benchmark sandboxes have external networking blocked and are deleted after every case.

Local Docker is unnecessary: `node --env-file-if-exists=.env --import tsx scripts/build-cloud-snapshot.ts` from `runtime-infra/` submits `infra/Dockerfile.cloud` to Daytona's remote builder. The script reuses its named snapshot rather than creating duplicates. Configure `DAYTONA_SNAPSHOT` with the returned immutable ID. Credentials remain server-side in ignored `.env` files.

Readiness: `node --env-file-if-exists=.env --import tsx scripts/verify-lab.ts`, or authenticated `POST /api/benchmark/readiness`. This provisions a real pinned sandbox, checks Python/Node/llama/all three manifests and cached files, retrieves the manifest, and confirms deletion. Readiness is not inference success.

## Full measured loop

1. Runtime obtains the fixed lab policy and requests engine candidates with that policy: five architecture families, Top 3 selected by predictions.
2. Each selected architecture runs every one of the three repository-repair cases (12 test assertions per full workload). All cases use the same resources, budgets, trusted test files, and evaluator.
3. Runtime sends the original architecture/workload plus complete case evidence and provenance to `/api/results/aggregate`. Missing or infrastructure-failed evidence cannot become a measured result.
4. Engine `/api/recommend` computes Pareto/Performance/Balanced/Efficient from complete measured workloads. These categories can legitimately select the same architecture.
5. Browser polling replaces only completed measured configurations in the table/3D and exposes run IDs, snapshot ID, workload fingerprint, and measurement context. Refresh uses the experiment URL and retained evidence.

Latency is the sum of each sandbox lifecycle (provision, inference, evaluation, cleanup), not just token generation. Resource is maximum Linux child-process peak RSS across cases, in MiB. It excludes the Python parent and provisioning/evaluator processes. Compute time, cost, and GPU usage are not inferred. Missing RSS is displayed as requested RAM, explicitly marked as such; it is not submitted as measured resource to the engine.

## Verification status

- Real snapshot build completed; all three pinned model SHA-256 checks passed.
- Real sandbox readiness passed; cleanup returned `DELETED`. Sanitized artifact: `runtime-infra/.local/readiness.json`.
- Full live browser experiment started: `5e581698-f5cf-4c24-b097-a1d3d2abd7be`. Inference verification is in progress; do not claim full-loop success from readiness alone.
- Runtime tests: 29 passed (includes true engine aggregation with explicitly synthetic test transport).
- Frontend tests: 23 passed; targeted evidence-gating browser checks: 3 passed.

Run the explicit real-cloud verifier from the repository root with `node scripts/verify-live-workload.mjs`. It creates a real experiment through the browser, writes full raw evidence under `artifacts/live/`, verifies refresh, and captures measured table/3D. To inspect an existing experiment without resubmitting: set `ATLAS_EXPERIMENT_ID`. Optional `ATLAS_BASE_URL` selects a deployed host. This script is excluded from ordinary automated tests.

Nosana/DNSimple capabilities are unchanged by this loop. Recorded teammate HumanEval results belong to their own workload/provider protocol and must not be merged into this three-case Daytona comparison.
