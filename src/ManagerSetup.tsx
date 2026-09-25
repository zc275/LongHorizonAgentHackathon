import { useEffect, useRef, useState } from "react";
import { demoSeed } from "../shared/demo-seed";

export type ProviderId = "liquid" | "nimble" | "rawtree";
export type ConnectionStates = Partial<Record<ProviderId, { configured: boolean; verifiedAt: string | null; message: string }>>;
export async function managerApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/manager/${path}`, { headers: { "X-Nightwatch-Local": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The request failed. Please try again.");
  return data;
}

const providers: { id: ProviderId; name: string; role: string; steps: string[]; href: string; account?: string }[] = [
  { id: "liquid", name: "Liquid AI", role: "Observe on your own computer", steps: ["Install llama.cpp and download the LFM2.5-VL-3B GGUF vision model with its matching vision projector.", "Start llama-server on port 8080 with the model and projector. Paste its local /v1 endpoint below.", "Test the model endpoint. This checks the model list; it does not switch the video from sample observations."], href: "https://docs.liquid.ai/deployment/on-device/llama-cpp" },
  { id: "nimble", name: "Nimble", role: "Find the missing information", steps: ["Open your Nimble account, then Settings → API Keys. Create or copy your key.", "Paste the key below. The test makes one small public search and may use account credits.", "Use Nimble for product documentation and sources. The current camera workflow does not yet trigger searches."], href: "https://docs.nimbleway.com/nimble-sdk/getting-started/quickstart", account: "https://online.nimbleway.com" },
  { id: "rawtree", name: "RawTree", role: "Keep the context between sessions", steps: ["Create a database named family_assistant_demo in your RawTree account.", "Create a read_write API key and enter the database name below. Keys are cluster-wide; the app selects this database explicitly.", "Test read access, load the sample household, then read it back in Demo assets."], href: "https://rawtree.com/docs/quickstart/api", account: "https://rawtree.com" }
];
export function ConnectionsSettings({ onStates, onRequest, focus, onShoppingPreview }: { onStates: (states: ConnectionStates) => void; onRequest: (provider: string | null) => void; focus: { id: string } | null; onShoppingPreview: () => void }) {
  const [states, setStates] = useState<ConnectionStates>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({ liquid: "http://localhost:8080/v1", database: "family_assistant_demo" });
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [messages, setMessages] = useState<Record<string, { text: string; error: boolean }>>({});
  useEffect(() => { void managerApi<ConnectionStates>("connections").then(result => { setStates(result); onStates(result); }).catch(() => {}); }, [onStates]);
  useEffect(() => { setExpanded(focus?.id ?? null); }, [focus]);
  async function connect(provider: ProviderId, disconnect = false) {
    setBusy(provider); onRequest(provider);
    setMessages(previous => ({ ...previous, [provider]: { text: "Contacting the service…", error: false } }));
    try {
      const result = await managerApi<{ connections: ConnectionStates; message: string }>(disconnect ? "disconnect" : "connect", disconnect ? { provider } : { provider, ...(provider === "liquid" ? { endpoint: values.liquid } : { apiKey: values[provider], ...(provider === "rawtree" ? { database: values.database } : {}) }) });
      setStates(result.connections); onStates(result.connections);
      setMessages(previous => ({ ...previous, [provider]: { text: result.message, error: false } }));
    } catch (reason) {
      setMessages(previous => ({ ...previous, [provider]: { text: reason instanceof Error ? reason.message : "Connection failed.", error: true } }));
      const next = await managerApi<ConnectionStates>("connections").catch(() => ({}));
      setStates(next); onStates(next);
    } finally {
      if (provider !== "liquid") setValues(previous => ({ ...previous, [provider]: "" }));
      setBusy(null); onRequest(null);
    }
  }
  return <>
    <p className="draft-notice">Keys stay on this computer until the server restarts.</p>
    {providers.map(provider => <section className="setup-provider" key={provider.id}>
      <button className="provider-disclosure" aria-expanded={expanded === provider.id} onClick={() => setExpanded(expanded === provider.id ? null : provider.id)}><span><strong>{provider.name}</strong><small>{provider.role}</small></span><span className={states[provider.id]?.verifiedAt ? "verified-label" : ""}>{busy === provider.id ? "Connecting…" : states[provider.id]?.verifiedAt ? "Test passed" : "Set up"}<span className="disclosure-chevron">{expanded === provider.id ? "−" : "+"}</span></span></button>
      {expanded === provider.id && <div className="provider-body">
        <details className="setup-help"><summary>Setup guide</summary><ol className="setup-steps">{provider.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <div className="setup-links">{provider.account && <a href={provider.account} target="_blank" rel="noreferrer">Open account ↗</a>}<a href={provider.href} target="_blank" rel="noreferrer">Official setup guide ↗</a>{provider.id === "liquid" && <a href="https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF" target="_blank" rel="noreferrer">Get vision model ↗</a>}</div></details>
        <form onSubmit={event => { event.preventDefault(); void connect(provider.id); }}>
          <label>{provider.id === "liquid" ? "Local endpoint" : "API key"}<input required autoComplete="off" spellCheck={false} type={provider.id === "liquid" ? "url" : "password"} value={values[provider.id] ?? ""} placeholder={provider.id === "rawtree" ? "rt_…" : "Paste your API key"} onChange={event => setValues({ ...values, [provider.id]: event.target.value })} /></label>
          {provider.id === "rawtree" && <label>Database<input required pattern="[a-zA-Z][a-zA-Z0-9_]{0,62}" value={values.database} onChange={event => setValues({ ...values, database: event.target.value })} /></label>}
          <div className="setup-actions"><button className="primary-button" disabled={busy !== null} type="submit">{busy === provider.id ? "Testing…" : "Connect & test"}</button>{states[provider.id]?.configured && <button className="quiet-link" type="button" disabled={busy !== null} onClick={() => void connect(provider.id, true)}>Disconnect</button>}</div>
        </form>
        {messages[provider.id] && <p className={`setup-feedback ${messages[provider.id].error ? "failed" : ""}`} role="status">{messages[provider.id].text}</p>}
      </div>}
    </section>)}
    <section className="setup-provider">
      <button className="provider-disclosure" aria-expanded={expanded === "instacart"} onClick={() => setExpanded(expanded === "instacart" ? null : "instacart")}><span><strong>Instacart</strong><small>Restock household essentials</small></span><span>Not connected<span className="disclosure-chevron">{expanded === "instacart" ? "−" : "+"}</span></span></button>
      {expanded === "instacart" && <div className="provider-body"><p className="draft-notice">Preview how a diaper restock request appears in the manager. This connection is not implemented; no order is placed.</p><button className="secondary-button" onClick={onShoppingPreview}>Preview request</button></div>}
    </section>
  </>;
}

const clips = [
  { title: "Caregiver at the crib", source: "Pexels · Kampus Production", use: "An adult present by the crib. A short visual example, not a monitoring benchmark.", url: "https://www.pexels.com/video/people-looking-over-the-crib-for-a-baby-7918207/", license: "https://www.pexels.com/license/" },
  { title: "Parent and baby at home", source: "Pexels · Polina Tankilevitch", use: "A clear adult-and-child scene for a basic visual description.", url: "https://www.pexels.com/video/a-mother-taking-care-of-her-baby-3875281/", license: "https://www.pexels.com/license/" },
  { title: "Nursery and cradle", source: "Pixabay · Vimeo-Free-Videos", use: "A short room scene. Check the framing before selecting it for your sequence.", url: "https://pixabay.com/videos/child-nursery-baby-newborn-girl-556/", license: "https://pixabay.com/service/license-summary/" }
];
export function DemoAssets({ rawtreeReady, onRequest }: { rawtreeReady: boolean; onRequest: (provider: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [rows, setRows] = useState<{ event_id: string; summary: string }[]>([]);
  const [preview, setPreview] = useState("");
  const previewRef = useRef("");
  useEffect(() => () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); }, []);
  async function load(read = false) {
    setBusy(true); setMessage(""); setFailed(false); onRequest("rawtree");
    try {
      const result = await managerApi<{ message: string; rows?: { event_id: string; summary: string }[] }>(read ? "memory" : "seed", read ? undefined : {});
      setMessage(result.message); if (result.rows) setRows(result.rows);
    } catch (reason) { setFailed(true); setMessage(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(false); onRequest(null); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(demoSeed, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "nightwatch-household.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <section className="asset-section"><h3>The Rivera household</h3><p>Twelve fictional events: Martin hands over to Anna, diaper stock drops from 6 to 5, and a reorder stays open for review. No real purchases or phone calls.</p><details className="seed-preview"><summary>Preview the 12 records</summary><ol>{demoSeed.map(row => <li key={row.event_id}>{row.summary}</li>)}</ol></details><p className="asset-destination">Destination: your selected RawTree database → family_demo_events</p><div className="setup-actions"><button className="primary-button" disabled={!rawtreeReady || busy} onClick={() => void load()}>{busy ? "Working…" : "Load sample household"}</button><button className="secondary-button" disabled={!rawtreeReady || busy} onClick={() => void load(true)}>Read memory</button><button className="quiet-link" onClick={download}>Download JSON</button></div>{!rawtreeReady && <p className="draft-notice">Connect RawTree first to load these records. You can download and review them now.</p>}{message && <p className={`setup-feedback ${failed ? "failed" : ""}`} role="status">{message}</p>}{rows.length > 0 && <div className="memory-results"><h3>Read back from RawTree</h3>{rows.map(row => <p key={row.event_id}>{row.summary}</p>)}</div>}</section>
    <section className="asset-section"><h3>Choose a video</h3><p>The bundled 100-second clip already matches the sample observations. Other clips can be previewed here; their observations need a real vision provider or their own reviewed annotations.</p><a className="quiet-link" href="https://globalnews.ca/video/3321270/twin-toddlers-slumber-party-caught-on-nanny-cam" target="_blank" rel="noreferrer">Bundled clip source: Global News / Corus ↗</a><p className="draft-notice">The bundled news footage is not licensed by the stock sites below.</p><div className="video-sources">{clips.map(clip => <article key={clip.url}><h4><a href={clip.url} target="_blank" rel="noreferrer">{clip.title} ↗</a></h4><small>{clip.source}</small><p>{clip.use}</p><a href={clip.license} target="_blank" rel="noreferrer">License</a></article>)}</div><label className="file-picker">Preview a local video<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (previewRef.current) URL.revokeObjectURL(previewRef.current); const url = URL.createObjectURL(file); previewRef.current = url; setPreview(url); }} /></label>{preview && <><video className="asset-video" src={preview} controls playsInline /><p className="draft-notice">Local preview only. This file is not uploaded or analyzed.</p></>}</section>
    <section className="asset-section"><h3>The most convincing sequence</h3><p>Use a fixed camera and film a short staged sequence: an adult enters, moves an object, leaves, briefly blocks the camera and returns. A doll makes the sequence repeatable. Keep the clip continuous so the audience can see why the context changes.</p></section>
  </>;
}
