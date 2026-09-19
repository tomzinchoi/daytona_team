# Web HumanEval execution

The workload screen has a **네 문제 실제 실행** button. Pasting a JSON array in
the workload textarea and selecting **내 워크로드 분석** selects the task IDs.
Only HumanEval/53, /23, /45 and /7 are accepted. The server uses the repository's
official prompts/tests for these IDs; uploaded prompt/test overrides are not run.

POST `/api/live` submits a job; GET `/api/live?id=<uuid>` polls it. The persistent
private Daytona API host runs `scripts/live-server.mjs` on port 3003. A single job
runs at a time, capped at four problems and the three configured models. Job
records are currently in memory and are lost on server restart. Keep the results
screen open until completion; this is a minimal live execution path.

Model calls use Vercel `/api/task`: 2048 output tokens, temperature 0, 50-second
model timeout. These settings differ from the historical `backend/bench.py` run,
so new measurements must not be presented as equivalent to saved results.
Reported milliseconds cover the Vercel model request, not sandbox provisioning
or evaluation. Missing timing/token values remain null.

Generated code and fixed Python tests execute only in an ephemeral, network-blocked
Daytona sandbox. The internal `/api/grade` endpoint requires `RUNTIME_API_TOKEN`,
allows only the four task IDs, enforces a 12-second process timeout, and checks
both exit status and a completion marker. No model code executes on Vercel or the
API host. The sandbox is deleted at the end; a 15-minute TTL provides a fallback.

Vercel serves as the API client for inference and grading because direct requests
from the Daytona API host to Nosana and sandbox toolbox hosts returned ECONNRESET.
The server-only `LIVE_API_URL` environment variable points to port 3003's private
preview URL. Provider secrets and preview tokens never enter the browser bundle.

To update an idle live server:

```powershell
node --env-file=runtime-infra/.env scripts/deploy-live.mjs
```

Do not restart while a benchmark is active. Updating Vercel environment variables
requires a subsequent Vercel deployment. Other changes to the live-server source
only require the server update command. Never commit `.vercel/backend-state.json`.
