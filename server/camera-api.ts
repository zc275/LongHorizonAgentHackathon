import express, { Router, type Request } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireLocalManager } from "./manager-api.js";

const token = () => randomBytes(32).toString("base64url");
const matches = (a: string, b: string) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
interface CameraSession {
  id: string; owner: string; pairing: string; sender: string | null;
  pairUntil: number; expires: number; frame: Buffer | null; frameAt: number; sequence: number;
  speakerReady: boolean; action: { sequence: number; type: "lullaby" | "voice" | "stop"; at: number } | null;
}
export function createCameraService(publicOrigin: () => Promise<string>, now = Date.now, visionEndpoint: () => string | null = () => null) {
  const sessions = new Map<string, CameraSession>();
  const admin = Router();
  const transport = Router();
  const prune = () => {
    for (const [id, session] of sessions) {
      if (session.expires <= now() || (!session.sender && session.pairUntil <= now())) sessions.delete(id);
      else if (now() - session.frameAt > 10_000) session.frame = null;
    }
  };
  const timer = setInterval(prune, 10_000);
  timer.unref();
  function authorize(request: Request, role: "owner" | "sender" | "either") {
    prune();
    const session = sessions.get(String(request.params.id));
    const bearer = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (!session || !bearer) return null;
    if (role !== "sender" && matches(bearer, session.owner)) return session;
    if (role !== "owner" && session.sender && matches(bearer, session.sender)) return session;
    return null;
  }
  admin.use(requireLocalManager);
  admin.post("/pair", async (_request, response) => {
    prune();
    if (sessions.size >= 8) return response.status(429).json({ error: "Too many camera sessions. Disconnect an unused camera first." });
    try {
      const origin = new URL(await publicOrigin());
      if (origin.protocol !== "https:") throw new Error("The phone camera needs an HTTPS address.");
      const id = randomBytes(16).toString("hex");
      const session: CameraSession = { id, owner: token(), pairing: token(), sender: null, pairUntil: now() + 10 * 60_000, expires: now() + 8 * 60 * 60_000, frame: null, frameAt: 0, sequence: 0, speakerReady: false, action: null };
      sessions.set(id, session);
      // The single-use secret stays in the fragment, away from server access logs.
      const url = new URL("/phone", origin);
      url.hash = new URLSearchParams({ id, key: session.pairing }).toString();
      return response.json({ id, ownerToken: session.owner, url: url.href, expiresAt: session.pairUntil });
    } catch (error) {
      return response.status(503).json({ error: error instanceof Error ? error.message : "The phone link could not start. Try again." });
    }
  });
  transport.use((_request, response, next) => {
    response.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    next();
  });
  transport.post("/:id/claim", express.json({ limit: "1kb" }), (request, response) => {
    prune();
    const session = sessions.get(String(request.params.id));
    const key = typeof request.body?.key === "string" ? request.body.key : "";
    if (!session || session.sender || session.pairUntil <= now() || !matches(key, session.pairing)) return response.status(403).json({ error: "This camera link has expired or was already used. Create a new link in the manager." });
    session.sender = token();
    session.pairing = "";
    return response.json({ senderToken: session.sender, expiresAt: session.expires });
  });
  transport.post("/:id/frame", (request, response, next) => {
    if (!authorize(request, "sender")) return response.status(403).json({ error: "Camera pairing ended. Scan a new link." });
    next();
  }, express.raw({ type: "image/jpeg", limit: "256kb" }), (request, response) => {
    const session = authorize(request, "sender");
    if (!session) return response.status(403).json({ error: "Camera pairing ended." });
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return response.status(400).json({ error: "Send a JPEG camera frame." });
    if (session.sequence > 0 && now() - session.frameAt < 100) return response.status(429).json({ error: "Slow down the camera frames." });
    session.frame = Buffer.from(bytes);
    session.frameAt = now();
    session.sequence += 1;
    return response.status(204).end();
  });
  transport.get("/:id/frame", (request, response) => {
    const session = authorize(request, "owner");
    if (!session) return response.status(403).json({ error: "Camera pairing ended. Connect your phone again." });
    response.set({ "X-Camera-State": session.sender ? "paired" : "waiting", "X-Frame-Sequence": String(session.sequence), "X-Frame-Time": String(session.frameAt), "X-Speaker-Ready": session.speakerReady ? "1" : "0" });
    if (!session.frame || now() - session.frameAt > 5000 || String(session.sequence) === request.query.after) return response.status(204).end();
    return response.type("image/jpeg").send(session.frame);
  });
  transport.post("/:id/speaker", express.json({ limit: "1kb" }), (request, response) => {
    const session = authorize(request, "sender");
    if (!session) return response.status(403).json({ error: "Camera pairing ended." });
    session.speakerReady = request.body?.enabled === true;
    return response.json({ speakerReady: session.speakerReady });
  });
  transport.post("/:id/action", express.json({ limit: "1kb" }), (request, response) => {
    const session = authorize(request, "owner");
    if (!session) return response.status(403).json({ error: "Camera pairing ended." });
    if (!session.sender || !session.speakerReady) return response.status(409).json({ error: "Enable sound on the phone first." });
    const type = request.body?.type;
    if (type !== "lullaby" && type !== "voice" && type !== "stop") return response.status(400).json({ error: "Choose a sound action." });
    session.action = { sequence: (session.action?.sequence ?? 0) + 1, type, at: now() };
    return response.json({ queued: true, sequence: session.action.sequence });
  });
  transport.get("/:id/action", (request, response) => {
    const session = authorize(request, "sender");
    if (!session) return response.status(403).json({ error: "Camera pairing ended." });
    const action = session.action;
    if (!action || action.sequence <= Number(request.query.after ?? 0) || now() - action.at > 10_000) return response.status(204).end();
    return response.json(action);
  });
  let analyzing = false;
  transport.post("/:id/analyze", async (request, response) => {
    const session = authorize(request, "owner");
    if (!session) return response.status(403).json({ error: "Camera pairing ended." });
    const endpoint = visionEndpoint();
    if (!endpoint) return response.status(409).json({ error: "Connect and test Liquid AI in Settings first." });
    if (!session.frame || now() - session.frameAt > 5000) return response.status(409).json({ error: "Waiting for a fresh camera image." });
    if (analyzing) return response.status(429).json({ error: "Vision is still processing the previous image." });
    analyzing = true;
    try {
      const models = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(5000) });
      if (!models.ok) throw new Error("The local vision model is unavailable.");
      const listing = await models.json() as { data?: { id: string }[] };
      const model = listing.data?.find(item => /lfm|liquid/i.test(item.id))?.id;
      if (!model) throw new Error("The local Liquid model is unavailable.");
      const result = await fetch(`${endpoint}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({ model, stream: false, max_tokens: 100, temperature: 0.1,
          messages: [{ role: "user", content: [
            { type: "text", text: "Describe only what is visibly happening in this nursery image in one short sentence. Do not infer sounds, crying, health, or danger from a still image." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${session.frame.toString("base64")}` } }
          ] }] })
      });
      if (!result.ok) throw new Error(`The local vision model returned ${result.status}.`);
      const output = await result.json() as { choices?: { message?: { content?: string } }[] };
      const description = output.choices?.[0]?.message?.content?.trim().slice(0, 300);
      if (!description) throw new Error("The local vision model returned no description.");
      return response.json({ description, observedAt: session.frameAt, provider: "Liquid AI" });
    } catch (reason) {
      return response.status(503).json({ error: reason instanceof Error ? reason.message : "Vision analysis failed." });
    } finally { analyzing = false; }
  });
  transport.delete("/:id", (request, response) => {
    const session = authorize(request, "either");
    if (!session) return response.status(403).json({ error: "Camera pairing already ended." });
    sessions.delete(session.id);
    return response.status(204).end();
  });
  return { admin, transport, dispose: () => { clearInterval(timer); sessions.clear(); } };
}
