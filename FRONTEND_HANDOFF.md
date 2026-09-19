# Session 3 — product / visualization

Root `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/` and `src/` belong to the frontend. Engine and runtime stay in their isolated subdirectories. Root package ownership follows ENGINE_HANDOFF.md and RUNTIME_HANDOFF.md. Do not install backend dependencies into the frontend root.

The frontend is React + Vite + Three.js. `src/data/demo.ts` is the single typed synthetic fixture. Demo stages advance by user click; no fake live timers.

`src/domain.ts` is the display contract. `src/api/client.ts` supports a future orchestration API (not yet implemented by either backend). Real engine and runtime contracts are also adapted at `src/api/services.ts`, using a same-origin Vite proxy to ports 3002 and 3001.

Integration gap: runtime's string-answer evaluators cannot generate the engine's coding build/test evidence. Until a coding evaluator/orchestration endpoint exists, the UI must never convert those runtime checks into coding quality or submit predictions to `/api/recommend`.

No Daytona SDK or optimization algorithms are implemented by the frontend.
