import { afterEach, beforeEach, expect, it } from "vitest";
import express from "express";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCameraService } from "./camera-api.js";
let service: ReturnType<typeof createCameraService>;
let server: Server;
let base: string;
let clock = 1_000_000;
const local = { Host: "localhost:3001", "X-Nightwatch-Local": "1" };
beforeEach(async () => {
  clock = 1_000_000;
  service = createCameraService(async () => "https://phone.example", () => clock);
  const app = express(); app.use("/admin", service.admin); app.use("/camera", service.transport);
  server = await new Promise<Server>(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { service.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
async function pair(): Promise<{ id: string; ownerToken: string; url: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/admin/pair`, { method: "POST", headers: local }, response => {
      let body = ""; response.on("data", chunk => { body += chunk; });
      response.on("end", () => { try { expect(response.statusCode).toBe(200); resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    });
    request.on("error", reject); request.end();
  });
}
async function claim(pairing: { id: string; url: string }) {
  const key = new URLSearchParams(new URL(pairing.url).hash.slice(1)).get("key");
  return fetch(`${base}/camera/${pairing.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
}
it("requires local manager authorization to issue a pairing", async () => {
  expect((await fetch(`${base}/admin/pair`, { method: "POST" })).status).toBe(403);
  expect((await fetch(`${base}/admin/pair`, { method: "POST", headers: { ...local, Origin: "https://evil.example" } })).status).toBe(403);
});
it("allows one claim and separates upload and viewing credentials", async () => {
  const p = await pair(); const { senderToken } = await (await claim(p)).json();
  expect((await claim(p)).status).toBe(403);
  const path = `${base}/camera/${p.id}/frame`;
  const bytes = new Uint8Array([255,216,255,217]);
  expect((await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${p.ownerToken}`, "Content-Type": "image/jpeg" }, body: bytes })).status).toBe(403);
  expect((await fetch(path, { headers: { Authorization: `Bearer ${senderToken}` } })).status).toBe(403);
  expect((await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${senderToken}`, "Content-Type": "image/jpeg" }, body: bytes })).status).toBe(204);
  const frame = await fetch(path, { headers: { Authorization: `Bearer ${p.ownerToken}` } });
  expect(frame.status).toBe(200); expect(frame.headers.get("cache-control")).toBe("no-store"); expect(frame.headers.get("x-frame-sequence")).toBe("1");
  clock += 6000;
  expect((await fetch(path, { headers: { Authorization: `Bearer ${p.ownerToken}` } })).status).toBe(204);
});
it("expires unused links and revokes both capabilities on disconnect", async () => {
  const expired = await pair(); clock += 600_001; expect((await claim(expired)).status).toBe(403);
  const p = await pair(); const { senderToken } = await (await claim(p)).json();
  expect((await fetch(`${base}/camera/${p.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${p.ownerToken}` } })).status).toBe(204);
  expect((await fetch(`${base}/camera/${p.id}/frame`, { headers: { Authorization: `Bearer ${p.ownerToken}` } })).status).toBe(403);
  expect((await fetch(`${base}/camera/${p.id}/frame`, { method: "POST", headers: { Authorization: `Bearer ${senderToken}`, "Content-Type": "image/jpeg" }, body: new Uint8Array([255,216,255,217]) })).status).toBe(403);
});
it("rejects non-image input without retaining it", async () => {
  const p = await pair(); const { senderToken } = await (await claim(p)).json();
  expect((await fetch(`${base}/camera/${p.id}/frame`, { method: "POST", headers: { Authorization: `Bearer ${senderToken}`, "Content-Type": "image/jpeg" }, body: "not an image" })).status).toBe(400);
  expect((await fetch(`${base}/camera/${p.id}/frame`, { headers: { Authorization: `Bearer ${p.ownerToken}` } })).status).toBe(204);
});
