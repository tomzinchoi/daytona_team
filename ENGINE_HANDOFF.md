# Benchmark / optimization engine ownership and integration

The engine is isolated in `benchmark-engine/`. Frontend and runtime files are owned by the other sessions. The root package/tsconfig initially bootstrapped by the engine are now available for the frontend session to adapt; the engine has independent package and TypeScript configuration.

- Engine HTTP service: `127.0.0.1:3002` (avoids runtime port 3001).
- Shared domain types: `benchmark-engine/src/shared/types.ts`.
- Importable backend functions: `benchmark-engine/src/index.ts` (compiled: `benchmark-engine/dist/index.js`).
- `GET /api/demo-workload` returns `{workload}`: 3 tiny JS repair cases, each with 4 trusted tests.
- `POST /api/architectures` accepts `{workload}` and returns 15 `candidateArchitectures` plus 3 ranked **PREDICTED** `screenedArchitectures`. Each screened entry contains `.architecture`.
- `POST /api/recommend` accepts `{workload, results, weights?, acceptableQuality?, resourceMetric?}`. Results must be full-workload **MEASURED** records, built with `createMeasuredResult` after real execution. Returns `paretoFrontier`, `performance`, `balanced`, `efficient`, and explicit warnings.
- Predictions must never be submitted as measurements. Missing telemetry must be `null`, never invented zeroes.

## Session 2 action required

The runtime source now includes `POST /api/benchmark/engine/run`, accepting `{provider: "daytona", architecture: <original engine architecture>, benchmarkCase: <original engine case>}`. It maps model IDs and role instructions, verifies sequential topology, and selects its `node_tests` coding evaluator. Poll the returned `statusUrl` until a terminal result. The string evaluators `exact_match`, `contains_all`, and `json_exact` still must not be translated into coding test/build evidence. Runtime and live-provider verification are owned by Session 2.

Run all 3 cases per selected architecture; preserve the exact architecture snapshot and workload fingerprint. Aggregate actual full-workload wall time and compatible resource telemetry. Record missing telemetry as null. Pass every case's real `CaseEvidence` to `createMeasuredResult`. Honor `architecture.compute.requestedCpuCores`, `requestedMemoryMb`, CPU-only execution, and inference token/time budgets, or reject the unsupported configuration. Provider availability is not assumed. Record actual hardware in resource measurementContext; do not silently execute different resource allocations under the same architecture ID.

For the runtime's current contract, accept only results with `measurement === "MEASURED"` and complete non-null `caseEvidence`. Use those caseEvidence records and sum sequential `metrics.totalElapsedMs`; retain the original full architecture. `NOT_AVAILABLE` is not measured evidence. Current runtime telemetry contains no cost, active compute-time, or measured peak-memory values: keep resource fields null until actual telemetry is available. Provisioned RAM is not peak memory. This yields a performance recommendation; all three categories require a common measured resource metric. The current runtime rejects compute policies that differ from its pinned snapshot/settings, so configure a matching lab for each selected variant.

## Session 3 action required

Use the engine's shared types for API data; adapt only at the UI boundary. Quality is 0–1; latency is milliseconds; resource units are explicit. The existing frontend Snapshot `/benchmarks` API is a separate proposed contract, not implemented by this engine. Add an orchestration adapter/proxy or call these engine APIs directly. No browser CORS is configured; prefer a same-origin backend proxy.

Keep predicted and measured records separate, show null metrics as unavailable, and show three recommendation categories even when multiple categories select the same architecture. A missing resource comparison intentionally leaves balanced/efficient unavailable. See `benchmark-engine/README.md` for the final verified contract and integration examples.

Engine verification: 32 tests passed; strict typecheck, production build, and compiled-server HTTP smoke passed. The default predicted Top 3 is `a-extended`, `a-standard`, `b-standard`. This session did not execute an open model or provision external infrastructure.
