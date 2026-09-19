# Continue from comparison into a task

In the web app, open **팀 실측 기록**, select one of the three models, then choose
**이 모델로 내 작업 이어가기**. The original workload text and uploaded file contents
are carried into an editable task. Submit, inspect the generated response, and
download it. Files are sent only when the user starts execution.

`POST /api/task` accepts `{ "modelId": "gemma4-e2b", "workload": "..." }`.
The model ID must be one of the three deployments in `backend/bench.py`; arbitrary
URLs and model names are rejected. The server sends the task to that existing
Nosana deployment with temperature 0 and a 2,048-token output cap. Its deadline
is 50 seconds; the Vercel function allows 60 seconds. No automatic retry occurs.

Responses include the actual output, model ID, elapsed request time, available
completion tokens, finish reason, and `evaluation: NOT_EVALUATED`. A length finish
reason is shown as potentially truncated output. Generation does not execute code,
run tests, change files, or update benchmark rankings. The original recorded
HumanEval protocol and scores are not claimed as measurements of the new task.

The site uses the existing public model deployment credentials from the teammate
CLI. No user-provided infrastructure URL or server secret is accepted from the UI.
The function runs on Vercel; plain Vite does not host `/api/task`. Browser tests
intercept the route; use the deployed site for actual inference.

Validation: `node --test backend/task-service.test.mjs`, `pnpm test`,
`pnpm exec playwright test e2e/task-execution.spec.ts`, and `pnpm build`.
Actual Gemma 4 E2B inference was checked locally and on the production function.
