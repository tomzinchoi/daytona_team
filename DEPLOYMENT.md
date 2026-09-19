# Repository and deployment

Repository: https://github.com/tomzinchoi/daytona_team

The root application is the React/Vite frontend. `benchmark-engine/`,
`runtime-infra/`, and `nosana-connection/` are separate backend/runtime packages.

## Frontend on Vercel

1. Authenticate with `pnpm dlx vercel login`.
2. From the repository root, run `pnpm dlx vercel link --yes --project daytona-team --scope mongben`.
3. Run `pnpm run build`.
4. Deploy with `pnpm dlx vercel deploy --prod --yes --scope mongben`.
5. Connect `tomzinchoi/daytona_team` in the Vercel project's Git settings to enable
   deployments on subsequent pushes to `main`.

`vercel.json` selects Vite and `dist`. API routes are excluded from the frontend
fallback. Vite development proxies do not run on Vercel: live backend operations
require separately hosted backend services and production API configuration.
Frontend deployment alone does not deploy Daytona workers or the benchmark engine.

Environment files and `.vercel/` are excluded from Git. Set deployment secrets in
the hosting provider rather than committing them.
