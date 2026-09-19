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

The runtime contract currently uses `{model, role}` and string-answer evaluators. Map engine `agents[].modelId` to runtime `model` and preserve role instructions and execution order. **A coding evaluator is needed** to execute each case's trusted build/test commands after applying the final model's file. `exact_match`, `contains_all`, and `json_exact` do not establish the coding workload's test pass rate. Do not translate those checks into fabricated test/build evidence.

Run all 3 cases per selected architecture; preserve the exact architecture snapshot and workload fingerprint. Aggregate actual full-workload wall time and compatible resource telemetry. Record missing telemetry as null. Pass every case's real `CaseEvidence` to `createMeasuredResult`. Follow the inference token/time budgets in `architecture.compute`; these are provider-managed inference budgets, not assertions about physical hardware.

## Session 3 action required

Use the engine's shared types for API data; adapt only at the UI boundary. Quality is 0–1; latency is milliseconds; resource units are explicit. The existing frontend Snapshot `/benchmarks` API is a separate proposed contract, not implemented by this engine. Add an orchestration adapter/proxy or call these engine APIs directly. No browser CORS is configured; prefer a same-origin backend proxy.

Keep predicted and measured records separate, show null metrics as unavailable, and show three recommendation categories even when multiple categories select the same architecture. A missing resource comparison intentionally leaves balanced/efficient unavailable. See `benchmark-engine/README.md` for the final verified contract and executable integration examples.
