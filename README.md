# Atlas — configuration intelligence

A frontend workbench for comparing Model × Agent Architecture × Compute on a recurring workload. React, TypeScript, Vite, and Three.js. No Daytona SDK calls or optimization algorithms are implemented in the frontend.

Implementation audit and remaining integration work: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md). Recent workbench bug fixes and verification: [WORKBENCH_FIXES.md](./WORKBENCH_FIXES.md).

## Run

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. Production build: `pnpm build`. Serve the build with `pnpm preview`.

The root package is the frontend. `benchmark-engine/`, `runtime-infra/`, and `nosana-connection/` are owned by the other sessions and have separate runtime/setup requirements. Do not install their dependencies into the frontend root.

## A 60–90 second demo

1. Click **Repository bug fixes**. This is the one-click demo entry; it supplies the example workload and opens 15 architecture candidates.
2. Click **Preview benchmark stages**. Three static, explicitly labeled demo statuses explain Daytona provisioning, running, and evaluation. No timer pretends a sandbox is executing.
3. Click **Reveal demo results**. The three selected points become solid and the supplied Pareto/recommendation highlights appear.
4. Drag the chart to orbit, scroll to zoom, hover a point for metrics, or click a point to inspect. The configuration dropdown offers keyboard access to every point. Inspect the quality breakdown.
5. Compare **Performance / Balanced / Efficient**. Click **Use this configuration** on any card.
6. Review **Selected Production Configuration**, then export its JSON. Selection is in-memory for this session; export does not deploy infrastructure.
7. Open **Providers** to see connection status. **Check runtime connections** reads the real runtime API. Unverified or unavailable connections never appear live.

All synthetic business data lives in **`src/data/demo.ts`**. No synthetic benchmark values are scattered through components. Demo results use **illustrative** evidence and cannot use the **measured** label. The initial screen has no results; synthetic metrics require explicitly opening the demo. The quality example is exactly passed test assertions / total assertions × 100, with equal assertion weights. vCPU-min values are explicitly resource estimates, not billing costs.

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

**Search engine’s coding workload** consumes:

- `GET /engine/api/demo-workload` → `{ workload }`.
- `POST /engine/api/architectures` with `{ workload }` → `candidateArchitectures`, `screenedArchitectures`.

**Check runtime connections** consumes:

- `GET /runtime/api/providers` → `{ providers: [{ id, status, reason, ... }] }`.

The engine shared types are imported from `benchmark-engine/src/shared/types.ts`. `src/api/services.ts` validates consumed response fields and adapts at the UI boundary: quality 0–1 becomes 0–100, milliseconds become seconds, inference budgets remain budgets, and explicit requested CPU/memory is labeled as requested. The current engine returns metrics for only its top three; all 15 candidates are listed, but the other 12 are not assigned invented coordinates. No predicted data is submitted as measured evidence.

The runtime now exposes individual coding-case execution, but **full-workload orchestration, aggregation, and engine-scored measured recommendations are not connected to this frontend**. Live execution is therefore blocked with a clear explanation at the engine-search boundary. The labeled demo remains fully usable. Do not convert arbitrary runtime checks into coding quality or invent missing telemetry. `POST /api/recommend` is not called until genuine complete-workload measured records can be provided.

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

No live Daytona benchmark was claimed or verified by the frontend work.
