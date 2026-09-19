# Production API connection

The Vercel project `mongben/daytona-team` serves the React UI and a short-lived
`api/gateway.mjs` function. Its `/engine/api/*` and `/runtime/api/*` rewrites forward
only allowlisted API routes to private Daytona preview endpoints. Provider keys,
the runtime bearer token, and preview access tokens stay on the server.

The API host is the dedicated Daytona sandbox `atlas-api-host`
(`4e74a6da-37bc-48a8-bd8f-2316ff166215`). Engine listens on 3002 and runtime on 3001.
This is separate from the ephemeral model execution sandboxes. Auto-stop and
auto-archive are disabled for the API host, so it incurs ongoing hosting usage.
Stop it in Daytona when the deployed demo is no longer needed; the site API will
then be unavailable until the host and its processes are restarted.

## Environment variables

Vercel production has the following server-only Secret variables:

- `DAYTONA_API_KEY`, `NOSANA_API_KEY`
- `ENGINE_API_URL`, `RUNTIME_API_URL`
- `ENGINE_PREVIEW_TOKEN`, `RUNTIME_PREVIEW_TOKEN`, `RUNTIME_API_TOKEN`

The runtime host separately loads provider keys, snapshot ID and benchmark policy
from `/home/daytona/atlas/runtime.env` (mode 600). Setting a Vercel variable does
not update that host: rerun the backend deployment script after local runtime
configuration changes. `.vercel/backend-state.json` contains credentials needed
to update this host. It is ignored by Git; never print, commit or share it.

## Update commands (repository root)

```powershell
pnpm --dir benchmark-engine run build
pnpm --dir runtime-infra run build
node --env-file=runtime-infra/.env scripts/deploy-backend.mjs
node scripts/configure-vercel-env.mjs
node --test scripts/gateway.test.mjs
pnpm run build
pnpm dlx vercel deploy --prod --yes --scope mongben
```

Coordinate with the other active project tasks before restarting the runtime or
redeploying the UI. Runtime restart interrupts in-flight work; finish jobs first.
The current orchestrator uses in-memory state plus local JSON evidence archives;
this hosting connection does not itself implement recovery after restart.

## What connection status means

Daytona LIVE means the runtime authenticated against the Daytona API. Model
execution additionally requires the pinned snapshot to be active and ready.
Nosana LIVE means its real inference API model catalog authenticated successfully.
The gateway explicitly reports `benchmark: false` for Nosana: a working API key
does not implement a GPU benchmark adapter. DNSimple is unrelated to these model
connections and remains unconfigured unless separately set up.

The generic frontend `/benchmarks` contract is independent of the runtime's
`/api/workloads` API. `VITE_API_BASE_URL` must not be set to an invented endpoint.
Use the runtime-connected coding workload action when the frontend exposes it.

## Verified on 2026-09-19

- Production deployment `dpl_GHoB7g6zoRT5i8p7EeymQLGEUz6g` reached READY and is
  aliased to `https://daytona-team.vercel.app`.
- Public engine workload endpoint returned HTTP 200 and 3 actual engine cases.
- Public provider endpoint returned HTTP 200; Nosana authentication verified 2
  served models. Daytona authentication succeeded before adding the snapshot.
- After applying snapshot `55ac80a8-14f4-4ba4-9928-c692764d3e83`, the runtime policy
  returned HTTP 200 with 300 seconds / 1024 tokens. Creating an experiment returned
  HTTP 503 `SNAPSHOT_NOT_READY` while that snapshot was still building. This is a
  model-image readiness issue, not missing API routing or credentials.
- Gateway regression test, frontend 15 unit tests and production build passed.
  The deployed initial JS/CSS assets contained neither provider key. Vercel's
  error-log query returned no entries during this verification.
- Model execution, permanent restart recovery, and external monitoring were not
  verified by the API connection work. Other active tasks own the measured loop
  and the newer backend/frontend integration.
