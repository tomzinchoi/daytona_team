# Remaining work after backend ingestion

Completed: shared contracts, deterministic 12-test workload, predicted model priors, 15-candidate screening, runtime-policy-constrained screening, measured quality, three-objective Pareto and recommendations, provenance-checked runtime ingestion, HTTP APIs, 53 tests.

## Next integration acceptance checks

1. **Session 2: actual full-workload runs.** Use one verified compute policy in `/api/architectures`; execute each shortlisted architecture against all 3 cases. Submit terminal records to `/api/results/aggregate`. Acceptance: all fingerprints and environment checks pass, no unavailable job is promoted to a measurement, and real objective evidence reaches `/api/recommend`.
2. **Session 2: resource telemetry.** Collect attributable actual USD cost, active compute time with a consistent hardware/accounting basis, or peak aggregate resident memory including model processes. Acceptance: one resource metric is available and comparable across every evaluated architecture; all three logical recommendation categories can be produced. Never substitute allocation or predicted cost.
3. **Session 3: measured UI orchestration.** Connect screening → runtime polling → aggregation → recommendations. Acceptance: evidence labels remain correct, null metrics stay unavailable, repeated category winners are supported, and each quality score exposes its objective explanation.

## Later backend improvements

4. **Repeated trials.** Design an explicit replicate contract and aggregation policy before accepting multiple runs of the same configuration. Report uncertainty and a declared latency percentile; do not cherry-pick the best run.
5. **Profile calibration.** Calibrate screening priors from a separate training/history set, retaining predicted labels and provenance. Compare shortlist coverage against held-out measured results before changing defaults.
6. **Persistent run history.** Choose storage and retention requirements with the integration owner. Preserve workload, architecture, evaluator, and model-version fingerprints with each run. No database or external infrastructure is introduced in the current scope.

The last three items require additional product/methodology decisions; they are deliberately not presented as completed MVP functionality.
