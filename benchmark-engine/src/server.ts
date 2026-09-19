import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { architecturesEndpoint, recommendEndpoint } from "./api.js";
import { DEMO_WORKLOAD } from "./benchmark/demo.js";
import { MODEL_PROFILES } from "./benchmark/models.js";
import { InputError } from "./benchmark/validation.js";

const MAX_BODY_BYTES = 1024 * 1024;
class BodyTooLarge extends Error {}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0, exceeded = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!exceeded) { exceeded = true; chunks.length = 0; reject(new BodyTooLarge()); }
      } else if (!exceeded) chunks.push(chunk);
    });
    request.on("end", () => {
      if (exceeded) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new InputError("Request body must be valid JSON")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new InputError("Request was aborted")));
  });
}

export function createBenchmarkServer() {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (request.method === "GET" && path === "/health") return json(response, 200, { status: "ok", service: "benchmark-engine", liveBenchmarkProviderConnected: false });
      if (request.method === "GET" && path === "/api/demo-workload") return json(response, 200, { workload: DEMO_WORKLOAD });
      if (request.method === "GET" && path === "/api/model-profiles") return json(response, 200, { profiles: MODEL_PROFILES, kind: "PREDICTED" });
      if (path === "/api/architectures" || path === "/api/recommend") {
        if (request.method !== "POST") { response.setHeader("allow", "POST"); return json(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } }); }
        if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return json(response, 415, { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use Content-Type: application/json" } });
        const body = await readJson(request);
        return json(response, 200, path === "/api/architectures" ? architecturesEndpoint(body) : recommendEndpoint(body));
      }
      return json(response, 404, { error: { code: "NOT_FOUND", message: "Unknown API route" } });
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (error instanceof BodyTooLarge) return json(response, 413, { error: { code: "BODY_TOO_LARGE", message: "JSON body exceeds 1 MiB" } });
      if (error instanceof InputError) return json(response, 400, { error: { code: "INVALID_INPUT", message: error.message } });
      return json(response, 500, { error: { code: "INTERNAL_ERROR", message: "Unexpected benchmark engine error" } });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new InputError("PORT must be an integer between 1 and 65535");
  const host = process.env.HOST ?? "127.0.0.1";
  createBenchmarkServer().listen(port, host, () => { console.log(`Benchmark API listening on http://${host}:${port}`); });
}
