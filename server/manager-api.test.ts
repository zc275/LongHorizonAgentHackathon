import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createManagerRouter, localModelEndpoint } from "./manager-api.js";
import { demoSeed } from "../shared/demo-seed.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("local manager connection boundaries", () => {
  let server: Server;
  let base: string;
  const remote = vi.fn<typeof fetch>();
  beforeEach(async () => {
    remote.mockReset();
    const app = express();
    app.use(express.json());
    app.use(createManagerRouter(remote));
    server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const headers = { Host: "localhost:3001", "X-Nightwatch-Local": "1", "Content-Type": "application/json" };
  async function call(path: string, body?: unknown, extra: Record<string, string> = {}) {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const request = httpRequest(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...extra } }, response => {
        const chunks: Buffer[] = [];
        response.on("data", chunk => chunks.push(Buffer.from(chunk)));
        response.on("end", () => { try { resolve({ status: response.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } });
      });
      request.on("error", reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  async function connectRawTree() {
    remote.mockResolvedValueOnce(json({ data: [{ connected: 1 }] }));
    return call("/connect", { provider: "rawtree", apiKey: "synthetic-key-do-not-expose", database: "family_assistant_demo" });
  }
  it("rejects external origins and requests without the local header before contacting providers", async () => {
    expect((await call("/connect", { provider: "nimble", apiKey: "test" }, { Origin: "https://untrusted.example" })).status).toBe(403);
    expect((await call("/connections", undefined, { "X-Nightwatch-Local": "" })).status).toBe(403);
    expect(remote).not.toHaveBeenCalled();
  });
  it("never returns an API key, and invalid replacement credentials clear the verified state", async () => {
    const result = await connectRawTree();
    expect(result.status).toBe(200);
    expect(JSON.stringify(result.body)).not.toContain("synthetic-key-do-not-expose");
    expect(JSON.stringify((await call("/connections")).body)).not.toContain("synthetic-key-do-not-expose");
    remote.mockResolvedValueOnce(json({ error: "echo synthetic-key-do-not-expose" }, 401));
    const failed = await call("/connect", { provider: "rawtree", apiKey: "invalid", database: "family_assistant_demo" });
    expect(failed.status).toBe(400);
    expect(failed.body.error).not.toContain("synthetic-key");
    expect((await call("/connections")).body.rawtree.configured).toBe(false);
  });
  it("blocks seeding until the database read check passes", async () => {
    expect((await call("/seed", {})).status).toBe(400);
    expect(remote).not.toHaveBeenCalled();
  });
  it("skips existing stable IDs and selects the configured database on every request", async () => {
    await connectRawTree();
    remote.mockResolvedValueOnce(json({ name: "family_demo_events" }));
    remote.mockResolvedValueOnce(json({ data: demoSeed.slice(0, 10).map(row => ({ event_id: row.event_id })) }));
    remote.mockResolvedValueOnce(json({ inserted: 2 }));
    const result = await call("/seed", {});
    expect(result.body.inserted).toBe(2);
    expect(remote.mock.calls.every(([url]) => String(url).includes("database=family_assistant_demo"))).toBe(true);
    const payload = JSON.parse(String(remote.mock.calls[3][1]?.body));
    expect(payload.map((row: { event_id: string }) => row.event_id)).toEqual(demoSeed.slice(10).map(row => row.event_id));
  });
  it("does not retry an ambiguous write or report it as a successful import", async () => {
    await connectRawTree();
    remote.mockResolvedValueOnce(json({}, 404));
    remote.mockRejectedValueOnce(new Error("network timeout"));
    const result = await call("/seed", {});
    expect(result.status).toBe(400);
    expect(remote).toHaveBeenCalledTimes(3);
  });
  it("loads the seed when RawTree reports an absent table with HTTP 400", async () => {
    await connectRawTree();
    remote.mockResolvedValueOnce(json({ error: "rawtree_error", message: "Table not found." }, 400));
    remote.mockResolvedValueOnce(json({ inserted: demoSeed.length }));
    const result = await call("/seed", {});
    expect(result.status).toBe(200);
    expect(result.body.inserted).toBe(demoSeed.length);
  });
  it("requires a Liquid model rather than accepting any reachable model server", async () => {
    remote.mockResolvedValueOnce(json({ data: [{ id: "some-other-model" }] }));
    const result = await call("/connect", { provider: "liquid", endpoint: "http://localhost:8080/v1" });
    expect(result.status).toBe(400);
    expect((await call("/connections")).body.liquid.configured).toBe(false);
  });
});
describe("local model destination validation", () => {
  it("accepts loopback and rejects remote hosts, credentials and unexpected paths", () => {
    expect(localModelEndpoint("http://localhost:8080/v1/")).toBe("http://localhost:8080/v1");
    for (const url of ["https://example.com/v1", "http://127.0.0.1.evil.test/v1", "http://user:secret@localhost:8080/v1", "http://localhost:8080/admin"]) expect(() => localModelEndpoint(url)).toThrow();
  });
});
