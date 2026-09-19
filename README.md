# Atlas — configuration intelligence

A frontend workbench for comparing Model × Agent Architecture × Compute on a recurring workload. React, TypeScript, Vite, and Three.js. No Daytona SDK calls or optimization algorithms are implemented in the frontend.

Current implementation status and remaining integration work: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md). The current public UI is restricted to Gemma 4 E2B, Qwen 3.5 9B, and GPT-OSS 20B. The initial screen has no benchmark results; the older synthetic demo and legacy-model execution entrypoints are hidden. Candidate predictions are not displayed as measured performance.

## Run

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. Production build: `pnpm build`. Serve the build with `pnpm preview`.

The root package is the frontend. `benchmark-engine/`, `runtime-infra/`, and `nosana-connection/` are owned by the other sessions and have separate runtime/setup requirements. Do not install their dependencies into the frontend root.

## Team backend results

1. Open **팀 실측 기록** or **Nosana × Daytona 실측 기록 보기**.
2. Compare the three models' problem pass rates, recorded response latency and tokens.
3. Select a model card or chart point to inspect generated code and grading errors.
4. Scrub the recorded timeline. It is a replay, not current execution.
5. Import a new `results_live.jsonl` or `results_full.jsonl` from `backend/bench.py`.
   Files are parsed locally and never uploaded by this viewer.
6. Export the validated records as JSONL. Missing timing/tokens stay missing.

See [HUMANEVAL_INTEGRATION.md](./HUMANEVAL_INTEGRATION.md) for the data contract,
provenance limits, supported models, and tests. This recorded-result viewer does
not start the Python CLI or claim that records are new website executions.

The older architecture-engine components below remain in source for separate
integration work. They use a different protocol and model catalog and are not
entrypoints in the current three-model public UI.

## Screens and components

- `src/App.tsx`: workload, candidate search, controlled benchmark, recommendations, and provider status.
- `src/components/BenchmarkSpace.tsx`: hero scatter panel, 2D fallback, tooltips, view controls, accessible configuration selector.
- `src/components/Scene.tsx`: lazy-loaded 3D scene, orbit controls, raycast selection, metric axes, evidence styling.
- `src/components/ConfigurationDetail.tsx`: architecture topology, compute, metrics, quality explanation, production selection, JSON export.
- `src/domain.ts`: runtime-validated UI contract and evidence integrity checks.

### Evidence and 3D behavior

X = latency in seconds; Y = task quality percentage; Z = resources in a shared explicit unit. Axes use the actual dataset ranges. Predictions are translucent. Measured points are solid. Pareto members have rings and a connecting visual guide; these memberships come from the fixture/API, never a frontend optimizer. Recommendations use purple (performance), lime (balanced), and teal (efficient), with the selected configuration ring emphasized.

On WebGL initialization failure, context loss, or scene/lazy-load errors, the panel displays an interactive SVG scatter chart. The SVG keeps latency and quality axes and exposes the resource metric in point details. **2D** is also a manual control. Application-level rendering failures show a reload action instead of a blank screen.

## API connections

### Existing Session 1/2 APIs consumed

The development server proxies `/engine/*` to `http://127.0.0.1:3002/*` and `/runtime/*` to `http://127.0.0.1:3001/*`. Start the backend services separately using their READMEs.

**Daytona 실측 워크로드 준비** consumes:

- `POST /runtime/api/workloads/example` → server-side engine screening with the actual pinned lab policy.
- `POST /runtime/api/workloads/:id/run` → idempotent asynchronous Top 3 × all cases execution.
- `GET /runtime/api/workloads/:id` → live progress, complete measured aggregates, recommendations, failures, and original case evidence.

**Check runtime connections** consumes:

- `GET /runtime/api/providers` → `{ providers: [{ id, status, reason, ... }] }`.

The engine shared types are imported from `benchmark-engine/src/shared/types.ts`. `src/api/services.ts` validates consumed response fields and adapts at the UI boundary: quality 0–1 becomes 0–100, milliseconds become seconds, inference budgets remain budgets, and explicit requested CPU/memory is labeled as requested. The current engine returns metrics for only its top three; all 15 candidates are listed, but the other 12 are not assigned invented coordinates. No predicted data is submitted as measured evidence.

The runtime now orchestrates the full loop: engine Top 3 → sequential Daytona execution for every case → `/api/results/aggregate` → `/api/recommend` → measured table/3D. `src/api/experiments.ts` adapts this boundary. Partial workload evidence never becomes a measured point. The common lab policy yields five architecture candidates and selects three; it does not claim to evaluate fifteen distinct compute settings. Linux peak child-process RSS supplies the measured resource axis. Missing RSS falls back to explicitly labeled requested RAM in the UI, while the engine leaves resource-dependent recommendations unavailable. Cost and compute time remain null. See [LIVE_BENCHMARK.md](./LIVE_BENCHMARK.md) for setup and actual verification evidence.

Experiment URLs contain `?experiment=<uuid>`. Runtime archives preserve outputs, tests, hashes, model manifests, recommendations, and cleanup results in `.local/experiments/`; browser refresh and runtime restart can reload them. Interrupted cloud executions are not automatically resubmitted after a restart. This is local disk persistence, not a replicated production database.

Production hosting must provide same-origin proxy routes to actual services. Vite's development proxies are not bundled into static production output. Without backend routes, the frontend shows errors and keeps the demo available.

### Optional future orchestration API

Set `VITE_API_BASE_URL` to enable the free-text **Benchmark my workload** action. `src/api/client.ts` is the single integration boundary:

- `POST /benchmarks` body `{ workload: string }` → `Snapshot`.
- `POST /benchmarks/:id/run` → `Snapshot`.
- `GET /benchmarks/:id` → `Snapshot`, polled every two seconds only while phase is `benchmark`.

`Snapshot` must match `snapshotSchema` in `src/domain.ts`, including `source: "api"`, phase, configurations, providers, and protocol. Each configuration includes topology, compute, evidence, latency, quality, resource value/unit/estimate flag, nullable tests, a weighted quality breakdown, status, and supplied recommendation/Pareto membership. Weighted quality must match the score. Resource units must be comparable. Optional `recommendations: [{ category, configurationId }]` allows multiple categories to select the same configuration. Absent categories display unavailable cards. This proposed orchestration endpoint is **not implemented by the existing engine/runtime services**.

Network timeouts, non-2xx responses, and invalid contracts show actionable errors. Polling pauses on failure and can be retried. New runs invalidate stale asynchronous responses. A custom task is never silently replaced by the repository demo. Missing values must be normalized honestly by the future adapter; invalid numeric evidence is rejected instead of coerced to zero.

## Validation

```sh
pnpm test       # evidence validation and actual engine contract adaptation
pnpm test:e2e  # Chrome desktop/mobile browser checks; Chrome must be installed
pnpm build     # TypeScript + production bundle
```

The browser suite covers three repeated full demo runs, configuration selection, download, 2D point interaction, forced WebGL initialization failure, context loss and recovery, custom-workload isolation, provider outages, engine failures, and mobile overflow. Screenshots are saved in `artifacts/`. The real local engine search was additionally verified against port 3002, returning 15 candidates and three predicted plotted configurations.

The automated suites use labeled test doubles and do not spend cloud credits. Live verification is separate and opt-in: `node scripts/verify-live-workload.mjs`. Check [LIVE_BENCHMARK.md](./LIVE_BENCHMARK.md) for the latest actual outcome.
