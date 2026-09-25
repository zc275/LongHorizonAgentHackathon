import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { demoDataset, demoSeed } from "../shared/demo-seed.js";

const providerSchema = z.enum(["liquid", "nimble", "rawtree"]);
type Provider = z.infer<typeof providerSchema>;
const configSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().max(4096).optional(),
  endpoint: z.string().trim().max(200).optional(),
  database: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/).optional()
}).strict();
interface Config { apiKey?: string; endpoint?: string; database?: string; verifiedAt?: string; message?: string }
export const requireLocalManager: RequestHandler = (request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\]):(3001|5173)$/.test(host);
  const localOrigin = !origin || /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(3001|5173)$/.test(origin);
  if (!localHost || !localOrigin || request.headers["x-nightwatch-local"] !== "1") {
    response.status(403).json({ error: "Open Settings from the local Nightwatch app." });
    return;
  }
  next();
};
export function localModelEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/v1") throw new Error("Use a local model endpoint such as http://localhost:8080/v1.");
  return url.href.replace(/\/$/, "");
}
export function createManagerRouter(fetcher: typeof fetch = fetch, onNimbleKey?: (key: string | null) => void, onLiquidEndpoint?: (endpoint: string | null) => void) {
  const router = Router();
  const configs: Partial<Record<Provider, Config>> = {};
  let seedBusy = false;
  const states = () => Object.fromEntries((["liquid", "nimble", "rawtree"] as Provider[]).map(provider => [provider, { configured: Boolean(configs[provider]), verifiedAt: configs[provider]?.verifiedAt ?? null, message: configs[provider]?.message ?? "Not connected" }]));
  router.use(requireLocalManager);
  async function remote(url: string, init: RequestInit = {}) {
    const response = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(25000) });
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? "The provider rejected the key or permissions." : `The provider returned HTTP ${response.status}. Check your account and selected database.`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function rawConfig() {
    const config = configs.rawtree;
    if (!config?.verifiedAt || !config.apiKey || !config.database) throw new Error("Connect and test RawTree first.");
    return config;
  }
  async function rawRequest(path: string, body?: unknown) {
    const config = rawConfig();
    return remote(`https://api.rawtree.com/v1/${path}?database=${encodeURIComponent(config.database!)}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  function errorMessage(reason: unknown) {
    // Never echo provider response bodies or credentials into logs or UI.
    if (reason instanceof Error && /^(Use a local|The provider|Connect and test|Enter |Choose |Unexpected |Seed |RawTree |No Liquid)/.test(reason.message)) return reason.message;
    return "The request could not finish. Check the endpoint, credentials and network connection. No automatic retry was made.";
  }
  router.get("/connections", (_request, response) => response.json(states()));
  router.post("/connect", async (request, response) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Check the provider, API key and database name." });
    const { provider, apiKey, database, endpoint } = parsed.data;
    delete configs[provider];
    if (provider === "nimble") onNimbleKey?.(null);
    if (provider === "liquid") onLiquidEndpoint?.(null);
    try {
      let message = "";
      let config: Config;
      if (provider === "liquid") {
        const base = localModelEndpoint(endpoint ?? "http://localhost:8080/v1");
        const result = await remote(`${base}/models`);
        const models = z.object({ data: z.array(z.object({ id: z.string() })) }).parse(result);
        const model = models.data.find(item => /lfm|liquid/i.test(item.id));
        if (!model) throw new Error("No Liquid model was advertised by this endpoint. Start an LFM vision model first.");
        message = `Model endpoint reachable: ${model.id}. Image inference is not enabled by this test.`;
        config = { endpoint: base };
      } else {
        if (!apiKey) throw new Error("Enter your API key.");
        config = { apiKey, database };
        if (provider === "rawtree") {
          if (!database) throw new Error("Choose the database created in RawTree.");
          const result = await remote(`https://api.rawtree.com/v1/query?database=${encodeURIComponent(database)}`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql: "SELECT 1 AS connected" }) });
          if (!Array.isArray(result.data) || Number(result.data[0]?.connected) !== 1) throw new Error("Unexpected RawTree query response.");
          message = `Read access verified for ${database}. Load the sample household to verify writes.`;
        } else {
          const result = await remote("https://sdk.nimbleway.com/v2/search", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: "site:docs.nimbleway.com search", max_results: 1, search_depth: "lite" }) });
          if (!Array.isArray(result.results)) throw new Error("Unexpected Nimble search response.");
          message = `Search responded with ${result.results.length} result(s). Camera research is not yet automatic.`;
        }
      }
      configs[provider] = { ...config, verifiedAt: new Date().toISOString(), message };
      if (provider === "nimble") onNimbleKey?.(apiKey!);
      if (provider === "liquid") onLiquidEndpoint?.(config.endpoint!);
      return response.json({ connections: states(), message });
    } catch (reason) { return response.status(400).json({ error: errorMessage(reason), connections: states() }); }
  });
  router.post("/disconnect", (request, response) => {
    const parsed = providerSchema.safeParse(request.body?.provider);
    if (!parsed.success) return response.status(400).json({ error: "Choose a provider." });
    delete configs[parsed.data];
    if (parsed.data === "nimble") onNimbleKey?.(null);
    if (parsed.data === "liquid") onLiquidEndpoint?.(null);
    return response.json({ connections: states(), message: "Connection cleared from server memory." });
  });
  router.post("/seed", async (_request, response) => {
    if (seedBusy) return response.status(409).json({ error: "Seed load already in progress." });
    seedBusy = true;
    try {
      const existing = new Set<string>();
      let exists = true;
      try { await rawRequest("tables/family_demo_events"); } catch (reason) {
        // RawTree reports a missing table as HTTP 400 on this read endpoint.
        if ([400, 404].includes((reason as { status?: number }).status ?? 0)) exists = false;
        else throw reason;
      }
      if (exists) {
        const result = await rawRequest("query", { sql: `SELECT DISTINCT event_id FROM family_demo_events WHERE dataset_id = '${demoDataset}' LIMIT 100` });
        if (!Array.isArray(result.data) || result.data.length >= 100) throw new Error("RawTree returned an incomplete seed history; no data was written.");
        for (const row of result.data) existing.add(String(row.event_id));
      }
      const missing = demoSeed.filter(row => !existing.has(row.event_id));
      if (missing.length) {
        const result = await rawRequest("tables/family_demo_events", missing);
        if (Number(result.inserted) !== missing.length) throw new Error("Seed write outcome is uncertain. Read memory before trying again.");
      }
      return response.json({ message: missing.length ? `RawTree accepted ${missing.length} synthetic events. Read memory to verify them.` : "The sample household is already loaded. No duplicate events were added.", inserted: missing.length });
    } catch (reason) { return response.status(400).json({ error: errorMessage(reason) }); }
    finally { seedBusy = false; }
  });
  router.get("/memory", async (_request, response) => {
    try {
      const result = await rawRequest("query", { sql: `SELECT event_id, kind, summary, sequence FROM family_demo_events WHERE dataset_id = '${demoDataset}' ORDER BY sequence ASC LIMIT 100` });
      const schema = z.object({ data: z.array(z.object({ event_id: z.string(), kind: z.string(), summary: z.string(), sequence: z.union([z.number(), z.string()]) })) });
      const parsed = schema.parse(result);
      const rows = [...new Map(parsed.data.map(row => [row.event_id, row])).values()];
      return response.json({ rows, message: `${rows.length} sample events read from RawTree.` });
    } catch (reason) { return response.status(400).json({ error: errorMessage(reason) }); }
  });
  return router;
}
