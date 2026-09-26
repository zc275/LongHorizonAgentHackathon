import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { RuntimeSnapshot } from "../shared/api.js";
import { databaseHealth } from "./db.js";
import { MockVisionProvider } from "./providers/mock-vision-provider.js";
import { SessionRuntime } from "./session-runtime.js";
import { createManagerRouter } from "./manager-api.js";
import { SqliteSessionPersistence } from "./persistence.js";
import { createAlertEnricher, NimbleSafetyResearchProvider, type AlertEnricher } from "./alert-enrichment.js";
import { createCameraService } from "./camera-api.js";
import { createCameraTunnel } from "./camera-tunnel.js";
import { resolve } from "node:path";
import { createTelemetrySink } from "./tinybird-telemetry.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const cameraPort = Number(process.env.CAMERA_PORT ?? 3002);
const cameraTunnel = createCameraTunnel(cameraPort);
let liquidEndpoint: string | null = null;
const camera = createCameraService(() => cameraTunnel.origin(), Date.now, () => liquidEndpoint);
let activeEnricher = createAlertEnricher();
const alertEnricher: AlertEnricher = {
  get mode() { return activeEnricher.mode; },
  enrich(context) { return activeEnricher.enrich(context); }
};

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use("/api/manager/camera", camera.admin);
app.use("/api/camera", camera.transport);
app.use("/api/manager", createManagerRouter(undefined, key => { activeEnricher = key ? new NimbleSafetyResearchProvider(key) : createAlertEnricher(); }, endpoint => { liquidEndpoint = endpoint; }));

// The phone gateway has no manager, session, credential, or database endpoints.
const phoneGateway = express();
phoneGateway.disable("x-powered-by");
phoneGateway.use((_request, response, next) => {
  response.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Permissions-Policy": "camera=(self), microphone=()", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
  next();
});
phoneGateway.use("/api/camera", camera.transport);
phoneGateway.get("/phone", (_request, response) => response.sendFile(resolve("dist/phone.html")));
phoneGateway.use("/assets", express.static(resolve("dist/assets"), { index: false, dotfiles: "deny" }));
phoneGateway.use((_request, response) => response.status(404).json({ error: "Not found" }));
const phoneServer = phoneGateway.listen(cameraPort, "127.0.0.1");
function closeCamera() { cameraTunnel.stop(); camera.dispose(); phoneServer.close(); }
process.once("exit", closeCamera);
process.once("SIGTERM", () => { closeCamera(); process.exit(0); });
process.once("SIGINT", () => { closeCamera(); process.exit(0); });

const sessions = new Map<string, SessionRuntime>();
const persistence = new SqliteSessionPersistence();
const telemetrySink = createTelemetrySink();

function runtimeFor(id: string): SessionRuntime | undefined {
  return sessions.get(id);
}

function writeSse(response: Response, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "nightwatch-api",
    database: databaseHealth(),
    timestamp: new Date().toISOString()
  });
});

app.post("/api/sessions", (_request, response) => {
  const id = randomUUID();
  const runtime = new SessionRuntime(id, new MockVisionProvider(), 2, 100, persistence, alertEnricher, telemetrySink);
  sessions.set(id, runtime);
  response.status(201).json(runtime.snapshot());
});

app.get("/api/sessions/:id/state", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  return response.json(runtime.snapshot());
});

app.get("/api/sessions/:id/events", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  const after = Number(request.query.after ?? 0);
  return response.json({ events: runtime.getEvents(Number.isFinite(after) ? after : 0) });
});

app.get("/api/sessions/:id/metrics", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  return response.json(runtime.snapshot().state.metrics);
});

app.get("/api/sessions/:id/notifications", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  return response.json({ notifications: runtime.snapshot().parent_notifications });
});

app.post("/api/sessions/:id/start", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  try {
    runtime.start(Number(request.body?.speed ?? 1));
    return response.json(runtime.snapshot());
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Unable to start" });
  }
});

app.post("/api/sessions/:id/pause", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  runtime.pause();
  return response.json(runtime.snapshot());
});

app.post("/api/sessions/:id/seek", async (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  const seconds = Number(request.body?.seconds);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > runtime.duration) {
    return response.status(400).json({ error: `seconds must be between 0 and ${runtime.duration}` });
  }
  await runtime.seek(seconds);
  return response.json(runtime.snapshot());
});

app.post("/api/sessions/:id/reset", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  runtime.reset();
  return response.json(runtime.snapshot());
});

app.post("/api/sessions/:id/restart", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  try {
    runtime.simulateRestart();
    return response.json(runtime.snapshot());
  } catch (error) {
    return response.status(409).json({ error: error instanceof Error ? error.message : "Unable to restore session" });
  }
});

app.post("/api/sessions/:id/occlusion", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });
  if (typeof request.body?.enabled !== "boolean") {
    return response.status(400).json({ error: "enabled must be a boolean" });
  }
  try {
    runtime.setTemporaryOcclusion(request.body.enabled);
    return response.json(runtime.snapshot());
  } catch (error) {
    return response.status(400).json({ error: error instanceof Error ? error.message : "Unable to change occlusion" });
  }
});

app.get("/api/sessions/:id/stream", (request, response) => {
  const runtime = runtimeFor(request.params.id);
  if (!runtime) return response.status(404).json({ error: "Session not found" });

  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();

  const onUpdate = (snapshot: RuntimeSnapshot) => writeSse(response, "state", snapshot);
  const heartbeat = setInterval(() => writeSse(response, "heartbeat", { at: Date.now() }), 15_000);
  runtime.on("update", onUpdate);
  writeSse(response, "state", runtime.snapshot());

  request.on("close", () => {
    clearInterval(heartbeat);
    runtime.off("update", onUpdate);
  });
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "API route not found" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`NurserAI API listening on http://localhost:${port}`);
});
