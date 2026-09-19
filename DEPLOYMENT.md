# Repository and deployment

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
