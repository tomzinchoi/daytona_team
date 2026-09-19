# Repository and deployment

## Korean comparison UI update

The interface is now Korean. 2D uses a white comparison table with a purple gradient header and quality-level bars; 3D uses the same colors in an interactive quality/latency/resource bar chart. Quality bars represent single scores, not invented score distributions. Demo data is explicitly illustrative; the initial screen contains no benchmark measurements.

Workload input supports drag/drop or selection of UTF-8 TXT, MD, CSV, JSON, JS, TS, and PY files (up to 5 files, 200KB each, 500KB combined; composed request up to 100,000 characters). Files are read locally, previewable, removable, and never executed in the browser. Text is optional. On a configured orchestration API, file contents are included in the workload request. This frontend deployment alone does not activate that API; disconnected submissions preserve the input and explain the missing connection.

Validation: 12 unit tests and 7 browser tests, including Korean navigation, file validation, 2D/3D switching, WebGL fallback, JSON export, empty-state evidence gating, provider errors, and mobile layout.

Repository: https://github.com/tomzinchoi/daytona_team

Production frontend: https://daytona-team.vercel.app

Vercel project: `mongben/daytona-team`. Initial production deployment reached
READY on 2026-09-19 from commit `b9200f5`. The live page and demo architecture
search were verified in the browser. All source packages are in GitHub.

Git integration could not connect to `tomzinchoi/daytona_team` with the current
Vercel account's repository access. Deployment currently uses the authenticated
CLI; Git pushes alone do not trigger deployment. The repository owner must grant
the Vercel GitHub integration access before automatic Git deployments can work.

The root application is the React/Vite frontend. `benchmark-engine/`,
`runtime-infra/`, and `nosana-connection/` are separate backend/runtime packages.

## Frontend on Vercel

1. Authenticate with `pnpm dlx vercel login`.
2. From the repository root, run `pnpm dlx vercel link --yes --project daytona-team --scope mongben`.
3. Run `pnpm run build`.
4. Deploy with `pnpm dlx vercel deploy --prod --yes --scope mongben`.
5. Connect `tomzinchoi/daytona_team` in the Vercel project's Git settings to enable
   deployments on subsequent pushes to `main`.

`vercel.json` selects Vite and `dist`. `/api`, `/engine`, and `/runtime` routes are
excluded from the frontend fallback and return HTTP 404 until backend routing is
configured. Vite development proxies do not run on Vercel: live backend operations
require separately hosted backend services and production API configuration.
Frontend deployment alone does not deploy Daytona workers or the benchmark engine.

Environment files and `.vercel/` are excluded from Git. Set deployment secrets in
the hosting provider rather than committing them.
