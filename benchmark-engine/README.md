# Workload benchmark and optimization engine

Backend-only MVP: **benchmark open models on your real workload before you deploy them.** No frontend, database, model download, external SDK, or infrastructure provisioning is included.

The engine generates 15 configurations, screens the Top 3 using explicitly predicted profiles, and accepts actual execution evidence for measured Pareto filtering and recommendations. It never substitutes predictions for missing measurements.

## Run and verify

Requires Node.js 22+ and pnpm. Run from the repository root:

```sh
pnpm --dir benchmark-engine install --frozen-lockfile
pnpm --dir benchmark-engine test
pnpm --dir benchmark-engine run typecheck
pnpm --dir benchmark-engine run build
pnpm --dir benchmark-engine start
```

Default engine address: `http://127.0.0.1:3002`. `HOST` and `PORT` override it. Runtime owns port 3001; the frontend owns the root package. This package has its own lockfile and builds to `benchmark-engine/dist/`. Its `*.node-test.ts` tests deliberately avoid discovery by the frontend's Vitest test runner.

On this Windows workspace, pnpm is available through the bundled executable if it is absent from PATH:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' --dir benchmark-engine test
```

Production consumers can import functions from `benchmark-engine/dist/index.js` and declarations from `benchmark-engine/dist/shared/types.d.ts`. TypeScript source consumers can import `benchmark-engine/src/index.ts` and `benchmark-engine/src/shared/types.ts` using their own bundler configuration. The backend entrypoint depends on Node; browsers should import shared **types only**.

## Shared contracts

`src/shared/types.ts` defines `Workload`, `BenchmarkCase`, `ModelProfile`, `AgentSpec`, `Architecture`, `ArchitectureTopology`, `BenchmarkMetrics`, `BenchmarkResult`, `Recommendation`, and `ProviderStatus`, plus request/response and execution-evidence types.

`BenchmarkResult` is a discriminated union:

| Field | PREDICTED result | MEASURED result |
| --- | --- | --- |
| `kind`, `metrics.kind` | `PREDICTED` | `MEASURED` |
| Architecture/models | Full snapshot and ordered unique model IDs | Full snapshot and ordered unique model IDs |
| Provider | Target provider, `NOT_CONFIGURED` | Actual provider, `READY` at execution start |
| `succeeded` | `null` — no run occurred | Derived from all cases' actual evidence |
| Quality | Prior-derived score and assumptions | Recomputed score, objective breakdown, rationale, evidence |
| Latency | Estimated total milliseconds | Actual full-workload wall milliseconds |
| Resource/cost | Predicted relative compute and memory; no dollar claim | Actual cost/compute/memory, with explicit `null` for unavailable metrics |
| Provenance | Workload ID, version, and full contract SHA-256 | Same, plus actual measurement timestamp |

All quality values are **0–1**, durations are **milliseconds**, memory is **MiB**, and cost is **USD**. Results with different workload versions, tests, instructions, file contents, scoring policies, or case order fail fingerprint validation. Measured quality fields and `succeeded` must match submitted case evidence. Evidence attestation belongs to the trusted executor: this engine validates consistency, not whether a remote caller actually ran a model.

## Deterministic coding workload

`DEMO_WORKLOAD` contains 3 independent CommonJS repair tasks:

1. **clamp**: repair inverted inclusive bound logic.
2. **mean**: repair the arithmetic mean denominator while handling an empty array.
3. **unique**: retain first-occurrence order when removing duplicate strings/numbers.

Each case supplies a buggy `solution.cjs`, an instruction, a whitelist of editable files, and a trusted `solution.test.cjs` with 4 tests. No dependencies or network are required. The commands are argument arrays, not shell strings:

```sh
node --check solution.cjs
node --test --test-reporter=tap solution.test.cjs
```

The build signal is a JavaScript syntax check, not a bundler build. There are no lint/typecheck points for these JavaScript fixtures. All three buggy baselines fail their tests. Test-only reference repairs pass all 12 tests; they are not exposed by the demo API or submitted to models.

Quality is:

```text
0.80 × (passed trusted tests / 12)
+ 0.10 × (successful syntax checks / 3)
+ 0.10 × (fully successful tasks / 3)
```

A fully successful task must finish with `COMPLETED`, a successful build, and every expected test passing. A timeout/error cannot earn task-success credit. Skipped/unexecuted tests earn no test credit and remain in the denominator. Every case must have exactly `expectedTests = passed + failed + skipped`; missing cases and duplicate case IDs are rejected. A partial run can meet the default 0.8 quality threshold while `succeeded` is false; consumers must show both fields.

## Profiles, compute configurations, and screening

The three model profiles are Qwen3 4B, DeepSeek-R1-Distill-Qwen-7B, and Gemma 3 4B. Every numeric characteristic is explicitly `PREDICTED`: coding, reasoning, instruction following, verification, speed, and memory. Values are illustrative, uncalibrated hypotheses. They are not published benchmark claims or evidence of model superiority. The demo is text-only and does not exercise Gemma's multimodal capability.

Five families × three compute budgets generate 15 candidates:

| Family | Agent execution order |
| --- | --- |
| A | Qwen implementer |
| B | DeepSeek implementer |
| C | DeepSeek planner → Qwen implementer |
| D | Qwen implementer → Gemma reviewer |
| E | DeepSeek planner → Qwen implementer → Gemma reviewer |

| Compute ID | Requested CPU cores | Requested RAM MiB | Output tokens per agent | Full-case deadline ms |
| --- | ---: | ---: | ---: | ---: |
| compact | 2 | 12288 | 384 | 20000 |
| standard | 4 | 16384 | 768 | 40000 |
| extended | 8 | 16384 | 1536 | 80000 |

These are CPU-only requests; availability is unverified. Session 2 must honor or reject them and record the actual environment. Models are managed by the provider's executor; the engine does not load them. Cases and stages execute sequentially. The final agent always returns the complete repaired file, including when it is a reviewer.

Screening uses implementation priors, possible specialization gains, handoff penalties, token budgets, hypothetical square-root CPU throughput scaling, and predicted allocated CPU-seconds. It applies normalized weights 0.50 quality / 0.30 latency / 0.20 resource, then returns the highest-scoring 3. There is no forced preference for multiple agents or family-diversity quota. Memory predictions assume serial model unloading and may underestimate a provider that keeps every model resident. No screening value may be rendered as a measured result.

## Measured optimization

`recommend({workload, results, weights?, acceptableQuality?, resourceMetric?})` accepts **one actual full-workload result per architecture ID**. Duplicate results/trials are rejected rather than cherry-picked. Repeated-trial aggregation and statistical uncertainty are outside this MVP.

Pareto dominance requires quality no worse, latency no greater, and resource no greater, with at least one strict improvement. Identical points both remain on the frontier. The default resource priority is a metric available for **every** evaluated result: actual `costUsd`, then `computeTimeMs` with identical `computeTimeBasis`, then `peakMemoryMb`. An explicitly requested metric never silently switches to another metric. Zero measured cost is valid; null is unknown.

- **PERFORMANCE**: highest measured quality; ties prefer latency, comparable resource, then stable result ID.
- **BALANCED**: highest min-max normalized utility on the frontier, with default weights **0.50 / 0.30 / 0.20**. Ranges use the full evaluated set; a tied dimension gives identical full utility to all points.
- **EFFICIENT**: lowest measured resource on the frontier with quality at least **0.8**, or the explicit threshold. The threshold is never silently relaxed.

There are exactly three named recommendation slots. The same architecture can win multiple categories. With no measurements all slots are null. With no common resource measurement only performance is available; Pareto, balanced, and efficient remain unavailable with a warning. If no result meets acceptable quality, efficient is null. These responses preserve the chosen three-dimensional objective rather than inventing a resource score or silently dropping its weight.

Every recommendation is scoped to: **“Best among evaluated configurations for this workload.”** It does not claim universal optimality.

## HTTP API

| Method / path | Request | Response |
| --- | --- | --- |
| `GET /health` | — | Service status; this engine has no live-provider connection |
| `GET /api/demo-workload` | — | `{workload: Workload}` |
| `GET /api/model-profiles` | — | `{profiles: ModelProfile[], kind: "PREDICTED"}` |
| `POST /api/architectures` | `{workload: Workload, computeConfigs?: ComputeConfig[]}` | `{candidateArchitectures: Architecture[], screenedArchitectures: PredictedBenchmarkResult[], screeningKind: "PREDICTED"}` |
| `POST /api/results/aggregate` | `{id, workload, architecture, provider, measuredAt, runs, resource?}` | `{result: MeasuredBenchmarkResult}` |
| `POST /api/recommend` | `{workload, results: MeasuredBenchmarkResult[], weights?, acceptableQuality?, resourceMetric?}` | `RecommendResponse` below |

```typescript
interface RecommendResponse {
  kind: "MEASURED";
  paretoFrontier: MeasuredBenchmarkResult[];
  performance: Recommendation | null;
  balanced: Recommendation | null;
  efficient: Recommendation | null;
  resourceMetric: "costUsd" | "computeTimeMs" | "peakMemoryMb" | null;
  weights: { quality: number; latency: number; resource: number };
  acceptableQuality: number;
  evaluatedCount: number;
  warnings: string[];
  claim: "Best among evaluated configurations for this workload.";
}
```

POST bodies require `Content-Type: application/json` and have a 1 MiB limit. Errors are `{error: {code, message}}`: 400 invalid input or mixed evidence, 404 unknown route, 405 wrong method, 413 oversized body, 415 wrong content type. No state is persisted. Framework adapters may directly call `architecturesEndpoint(unknown)` and `recommendEndpoint(unknown)` for the same validation and return contracts.

## Exact Session 2 integration

### Match the available runtime before screening

Pass `computeConfigs` to `/api/architectures` when the runtime uses a fixed prepared snapshot. Each supplied policy must be verified by the caller against the real lab: `id` (compact/standard/extended), `requestedCpuCores`, `requestedMemoryMb`, `accelerator: "CPU_ONLY"`, `maxOutputTokensPerAgent`, `timeoutMsPerCase`, `maxConcurrentCases: 1`, `modelHosting: "PROVIDER_MANAGED"`. One policy produces 5 architecture candidates and the Top 3; two produce 10, three produce 15. Omission preserves the original 15-candidate search. The engine never probes infrastructure or assumes that a supplied policy is available.

### Ingest terminal runtime records

`POST /api/results/aggregate` (or the pure `aggregateRuntimeResults` function) now handles the previously manual aggregation step. `runs` contains the terminal per-case result objects, not polling envelopes. Supply the original `workload`, selected `architecture`, `provider` status captured at execution start, a unique aggregate `id`, and actual completion timestamp `measuredAt`.

The adapter verifies full case coverage, unique run IDs, `MEASURED` execution, provider identity, source architecture SHA-256, trusted fixture SHA-256, the requested CPU/RAM/token/time policy, ordered agent models/instructions, objective success, and consistent snapshot/runner/model-manifest provenance across cases. It sums actual sequential total wall durations and recomputes quality. Incomplete evidence and `NOT_AVAILABLE` executions are rejected. As with the other endpoints, these are consistency checks, not cryptographic proof that an untrusted caller ran a model.

Optional `resource` must be actual telemetry covering the entire run set. Omit it to preserve all resource metrics as null; the adapter does not turn provisioned RAM or wall time into utilization. Submit returned `.result` objects to `/api/recommend`. No provider network call is made by aggregation.

### Execution requirements

1. Obtain the workload and screening response. Keep the original workload object and each selected `.architecture` unchanged.
2. For each of the 3 selected architectures, provision the requested CPU/RAM configuration or report that it is unavailable. Missing provider credentials or an unavailable model are provider failures, not measured benchmark evidence.
3. Run all 3 cases sequentially in isolated provider environments. Supply `case.instruction`, `case.files`, and each `agent.instruction`. Follow the topology, forwarding the planner's plan and implementer's corrected file as appropriate. Enforce the **entire-case** deadline, token caps, and editable-file whitelist.
4. Apply only the final agent's complete `solution.cjs`. Restore trusted `case.evaluation.files` from the workload. Run the syntax check and trusted test command as argument arrays inside the execution environment. Do not let model output replace tests or evaluator code. Untrusted generated code must not run in the API host process.
5. Emit `CaseEvidence` for every case. Actual assertion failures are `failed`. Unrun tests after a build failure, timeout, or error are `skipped`. If TAP cannot be reliably parsed, do not invent passed tests; use an error record with the unaccounted tests skipped. `status` describes execution completion; `COMPLETED` may still include failing assertions. Only test/build execution can supply these signals.
6. Measure total wall time over all cases and agents, including setup/evaluation overhead under a consistent timing boundary. Sum actual attributable costs and compute time. `computeTimeBasis` must identify the hardware and accounting unit, e.g. a specific CPU model's active core-milliseconds. Do not substitute wall time for compute telemetry. `peakMemoryMb` is the peak aggregate resident memory of the benchmark processes including model inference, not provisioned RAM. Use `null` when that scope cannot be measured. Document hardware, quantization, inference engine, and scope in `measurementContext`.
7. Build one full-workload result with the helper below, then submit all results to `/api/recommend`. Set `provider.status` to its actual `READY` snapshot at execution start. Execution failures after a real attempt remain measured failures with objective partial/zero evidence. A failure before execution is a provider/job error, not a fabricated measured result.

```typescript
import { createMeasuredResult, recommend } from "./benchmark-engine/dist/index.js";
import type { CaseEvidence, ProviderStatus, ResourceUsage } from "./benchmark-engine/dist/shared/types.js";

// These variables must come from the real Session 2 executor, not fixture values:
// workload, selectedArchitecture, runId, completedAt, actualTotalWallMs,
// evidence: CaseEvidence[], providerAtStart: ProviderStatus, telemetry: ResourceUsage.
const result = createMeasuredResult({
  id: runId,
  workload,
  architecture: selectedArchitecture,
  provider: providerAtStart,
  evidence,
  latencyMs: actualTotalWallMs,
  resource: telemetry,
  measuredAt: completedAt,
});
const recommendations = recommend({ workload, results: allMeasuredResults });
```

**Current runtime adapter:** Session 2 has added `POST /api/benchmark/engine/run` on port 3001. Send `{provider: "daytona", architecture: selectedArchitecture, benchmarkCase: workload.cases[i]}` with the original engine objects. It returns HTTP 202 with a `statusUrl`; poll that URL for the completed per-case result. `runtime-infra/src/engine-adapter.ts` maps model IDs, roles/instructions, compute constraints, and the trusted files into its `node_tests` evaluator. It verifies the expected Node commands and uses its event-based reporter to collect objective evidence. The older string-answer evaluators still cannot establish this workload's coding quality.

For the observed runtime result contract, accept only `measurement === "MEASURED"` with non-null `caseEvidence` for every case. Pass the collected `caseEvidence` values to `createMeasuredResult` and sum `metrics.totalElapsedMs` for the sequential full-workload latency. Keep the original full architecture; the minimal runtime architecture alone loses required engine fields. A `NOT_AVAILABLE` record must never become measured evidence. Incomplete case evidence must be resolved by the executor before aggregation.

The current runtime pins one CPU/RAM snapshot and one token/deadline policy, rejecting mismatches with `COMPUTE_POLICY_MISMATCH`. Session 2 must use matching settings for each selected variant. It currently provides no actual cost, active compute-time, or measured peak-memory telemetry: keep those fields and `computeTimeBasis` null, and describe the actual environment in `measurementContext`. Provisioned RAM and elapsed wall time must not be relabeled as measured memory or compute usage. Performance can be recommended with those null fields; a common measured resource metric is required for Pareto, balanced, and efficient results. Runtime adapter tests and live-provider validation remain Session 2's responsibility. The engine does not call or modify that service.

## Exact Session 3 integration

1. Use a same-origin backend/Vite proxy to engine port 3002. Runtime remains on 3001. The engine does not enable browser CORS or expose secrets.
2. Load `GET /api/demo-workload`; POST that complete `workload` to `/api/architectures`. Use `candidateArchitectures` for graph/topology structure and `screenedArchitectures` to identify the Top 3 and display their predicted metrics. Unscreened candidates have no returned metrics; do not invent them. If more predicted points are needed, the backend function `screenArchitectures(workload, candidates, candidates.length)` returns all ranked predictions.
3. Pass only the three `.architecture` objects to the Session 2 execution adapter. Display provider/run state from the runtime. The screening provider status is a placeholder target, not a connectivity check.
4. Collect full-workload measured results, then call `/api/recommend`. The existing `/benchmarks` Snapshot contract is a separate orchestration API, not provided by this engine. A service adapter must orchestrate screening → actual execution → evidence aggregation → recommendations. Session 3 has already added a screening/provider adapter in `src/api/services.ts`; the measured aggregation flow still needs to follow this contract.
5. Map quality to percent with `score * 100`, latency to seconds with `latencyMs / 1000`, and use explicit resource units. For measured quality explanations, use `metrics.quality.rationale` and its test/build/task breakdown. Show actual tests only for measured evidence. Preserve `succeeded` separately from the quality score.
6. Map recommendation `resultId` to a measured result and `architectureId` to its configuration. Draw Pareto status only for IDs in `paretoFrontier`. Show three logical categories; repeat the architecture if it wins multiple categories. Respect null recommendations, missing resources, warnings, and the workload-scoped claim. Never mark a prediction as measured merely because the user moved to a results screen.

## Verification

The automated suite checks architecture generation, single/multiple agents, predicted screening and changed priors, measured/predicted separation, objective quality, workload fingerprints, Pareto filtering, all three recommendation categories, thresholds, zero/missing/incompatible telemetry, deterministic ties, bad HTTP inputs, and real execution of all three demo fixtures before/after reference fixes.

Unit-test measurement records are explicitly synthetic and live only under `tests/`; no endpoint returns synthetic measurements. No real open-model or Daytona benchmark is claimed by this package.

Verified after the ingestion upgrade: **53 tests passed**, including HTTP ingestion → recommendation, invalid provenance rejection, and runtime-constrained screening. Strict typecheck and production TypeScript build are required checks. Default predicted shortlist: `a-extended`, `a-standard`, `b-standard`. These predictions are not live benchmark results.
