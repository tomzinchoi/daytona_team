# Continue from comparison into a task

In the web app, open **팀 실측 기록**, select one of the three models, then choose
**이 모델로 내 작업 이어가기**. The original workload text and uploaded file contents
are carried into an editable task. Submit, inspect the generated response, and
download it. Supply grading criteria before execution: text answer, JSON answer,
or Python function input/output test cases. The UI automatically grades the response.
Files are sent only when the user starts execution.

`POST /api/task` accepts `{ "modelId": "gemma4-e2b", "workload": "..." }`.
The model ID must be one of the three deployments in `backend/bench.py`; arbitrary
URLs and model names are rejected. The server sends the task to that existing
Nosana deployment with temperature 0 and a 2,048-token output cap. Its deadline
is 50 seconds; the Vercel function allows 60 seconds. No automatic retry occurs.

Generation responses include the actual output, model ID, elapsed request time, available
completion tokens, finish reason, and `evaluation: NOT_EVALUATED`. A length finish
reason is shown as potentially truncated output. Generation itself does not execute code
or update benchmark rankings. The original recorded
HumanEval protocol and scores are not claimed as measurements of the new task.

The site uses the existing public model deployment credentials from the teammate
CLI. No user-provided infrastructure URL or server secret is accepted from the UI.
The function runs on Vercel; plain Vite does not host `/api/task`. Browser tests
intercept the route; use the deployed site for actual inference.

Validation: `node --test backend/task-service.test.mjs`, `pnpm test`,
`pnpm exec playwright test e2e/task-execution.spec.ts`, and `pnpm build`.
Actual Gemma 4 E2B inference was checked locally and on the production function.

## Automatic grading

After generation, the UI calls `POST /api/task-grade` with `{output, criteria}`.
Generation and grading have separate timeouts. A grading infrastructure failure
preserves the generated output and offers grading-only retry without another model call.
Criteria are never included in model prompts (only a Python function name or a JSON
format instruction is included when applicable). A `.txt` or `.json` criteria file
can be loaded in the UI, up to 100 KB.

Supported criteria:

```json
{"type":"text_exact","expected":"answer"}
```

```json
{"type":"json_exact","expected":{"category":"billing"}}
```

```json
{"type":"python","functionName":"add","cases":[{"args":[2,3],"expected":5},{"args":[-2,2],"expected":0}]}
```

The Python editor/file accepts `{functionName,cases}`; the UI adds `type`.
The JSON answer editor accepts just the expected JSON value.
Python is standard-library only, accepts 1–10 positional-argument test cases,
and requires a JSON-serializable return value. Each case uses a fresh Python
process in a private, network-blocked, ephemeral Daytona sandbox, with 2 seconds
CPU, 2.5 seconds wall time, and 256 MiB address-space limits. Expected outputs
remain outside the sandbox; the API compares returned values against them.
Sandbox deletion is attempted in `finally`, with a 10-minute TTL backup.

The score is `passed / total * 100`, exclusively for supplied criteria. Wrong
answers, syntax errors and per-case execution failures count as failed tests;
provisioning or incomplete grading returns an error, never a fabricated zero.
Responses include per-case evidence, output/criteria SHA-256 hashes and a timestamp.
The score does not change original benchmark rankings or assert universal quality.

Additional checks: `node --test backend/task-grading.test.mjs` and
`pnpm exec playwright test e2e/task-grading.spec.ts`.

## Production verification (2026-09-19)

- Production: https://daytona-team.vercel.app — READY, source commit `44e3f5d`.
- Immutable deployment: https://daytona-team-4yhq5s01n-mongben.vercel.app.
- React/Vite production build completed in 31 seconds on Vercel.
- 24 frontend unit tests, 6 server tests, and 20 browser tests passed.
- Real production browser flow: Gemma 4 E2B generation → isolated Python grading
  returned HTTP 200, 3/3 passing tests (100%) for the example addition function.
  No browser page errors occurred. This is a verification example, not a model ranking.
- Production text/JSON exact grading also returned HTTP 200 and expected scores.
- A separate real Daytona negative-control run (correct, wrong, exception, infinite
  loop) returned 1/4 passing tests (25%).
- Vercel error-level log scan for this deployment found no logs. External log drains
  and monitoring integrations were not inspected or changed.
