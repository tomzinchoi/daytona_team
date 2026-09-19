# Team backend integration

The **팀 실측 기록** navigation item reads `backend/results_live.jsonl`, added by
the teammate in commit `6f19537`. This is a recorded run, not an HTTP service or
a new execution. Its source is bundled by Vite in a lazy-loaded screen.

The screen compares three Nosana models graded in Daytona. It exposes per-model
problem pass rate, recorded response latency, completion tokens, per-problem
generated code/errors, and a manual timeline based on `start_s` and `end_s`.
The bundled record contains 12 rows: Gemma 4/4, Qwen 3/4, GPT-OSS 4/4.

Missing latency and tokens remain missing. Means include only recorded values
and display their sample counts. A timeout counts as a failed problem but never
as zero latency. Problem pass rate is not assertion pass rate. Tokens are not
cost, GPU memory, or the architecture engine's resource metric. No measured date
or live provider status is inferred from this historical file.

Users can import one run from `results_live.jsonl` or `results_full.jsonl` using
the browser-only JSONL picker. Import accepts at most 1 MiB / 1,000 rows, validates
types, timestamps and basic evidence consistency, and rejects duplicate
model/problem pairs. Imports are restricted to the three configured team models.
Missing cases are flagged; unrecorded values are never
filled in. Importing a file does not authenticate its execution provenance.
Files are not uploaded, code is rendered as text, and no code is evaluated.

To obtain a fresh result, use the teammate's `backend/README.md` instructions,
then import the resulting JSONL. The separate runtime-workload API/UI remains
independent of this Python CLI and its model identities.

Validation: five aggregation/parser unit tests and three browser tests cover
the committed data, timeout handling, unequal workloads, malformed inputs,
local-only file import, export, replay controls, and mobile overflow. The full
18-case UI browser suite passed before the user retired the older demo and
Daytona-model entrypoints. Tests for those retired flows were replaced with
current three-model entrypoint, recorded-result isolation, and keyboard tests.
