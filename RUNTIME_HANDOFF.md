# Runtime / infrastructure ownership

The runtime work is isolated in `runtime-infra/` because frontend and engine sessions are editing this same workspace concurrently. Do not overwrite its package.json or source files. Runtime does not own the root package.json, tsconfig, frontend, or optimization engine.

Planned standalone HTTP server: `127.0.0.1:3001`.

- `GET /api/providers`: truthful provider statuses (no keys => NOT_CONFIGURED).
- `POST /api/benchmark/run`: `{provider?: "daytona", architecture: {id, agents: [{role, model}]}, benchmarkCase: {id, task, evaluator}}` => HTTP 202 job; `?wait=true` => terminal result.
- `GET /api/benchmark/runs/:id`: poll job status/history/result.
- `POST /api/benchmark/batch`: `{architectures: [...up to 3], benchmarkCases: [...up to 10]}` => HTTP 202 jobs.
- Model IDs: `qwen3-4b`, `deepseek-r1-distill-qwen-7b`, `gemma-3-4b`.
- Evaluators: `{type:"exact_match", expected:string}`, `{type:"contains_all", expected:string[]}`, `{type:"json_exact", expected:JSON}`.
- States: QUEUED, PROVISIONING, PREPARING, RUNNING, EVALUATING, COMPLETED, FAILED.
- Missing credentials, missing cached models, or infrastructure failures never become fabricated MEASURED results.

The full, verified contract and setup will live in `runtime-infra/README.md`. This API is an independent service; UI/engine calls require an adapter or proxy. No frontend work is performed by the runtime session.
