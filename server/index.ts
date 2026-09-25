import express from "express";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { RuntimeSnapshot } from "../shared/api.js";
import { databaseHealth } from "./db.js";
import { MockVisionProvider } from "./providers/mock-vision-provider.js";
import { SessionRuntime } from "./session-runtime.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const sessions = new Map<string, SessionRuntime>();

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
  const runtime = new SessionRuntime(id, new MockVisionProvider());
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

app.listen(port, () => {
  console.log(`Nightwatch API listening on http://localhost:${port}`);
});
