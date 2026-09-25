import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeSnapshot, TimelineEvent } from "../shared/api";
import type { StateMutation } from "../shared/domain";
import "./manager.css";
import { ConnectionsSettings, DemoAssets, managerApi, type ConnectionStates } from "./ManagerSetup";

type IconName = "home" | "settings" | "eye" | "search" | "memory" | "arrow" | "play" | "stop" | "reset" | "check" | "close" | "rules";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    memory: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    play: <path d="m8 5 11 7-11 7Z" />,
    stop: <path d="M7 7h10v10H7Z" />,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    rules: <><path d="M6 3v12a4 4 0 0 0 4 4h8M6 7h12" /><path d="m15 4 3 3-3 3m0 6 3 3-3 3" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Could not reach the local service. Check that the API is running and retry.");
  return response.json();
}
function time(value: number) { return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`; }
function words(value: string) { return value.replaceAll("_", " "); }
function eventCopy(m: StateMutation) {
  switch (m.type) {
    case "ROOM_STATE_CHANGED": return { title: "Room memory updated", source: "Memory", detail: "Matching observations updated the room state.", result: Object.entries(m.patch).filter(([key]) => !["uncertainties", "observed_at_seconds"].includes(key)).map(([key, value]) => `${words(key)}: ${String(value)}`).join(" · ") };
    case "SITUATION_OPENED": return { title: words(m.situation.type), source: "Rules", detail: "A confirmed room change matched a monitoring rule.", result: "A new situation is open and being tracked." };
    case "SITUATION_UPDATED": return { title: "New evidence added", source: "Rules", detail: "An open situation received another observation.", result: "The existing situation was updated." };
    case "SITUATION_RESOLVED": return { title: "Situation resolved", source: "Rules", detail: m.reason, result: "The situation is closed in the current session." };
    case "ALERT_EMITTED": return { title: "Review requested", source: "Rules", detail: "The configured alert threshold was reached.", result: "An in-app alert was recorded. No phone call was made." };
    case "MONITORING_UNCERTAIN": return { title: "View needs a check", source: "Vision", detail: m.reason, result: "Uncertainty was retained in the room state." };
  }
}

function Manager() {
  const [tab, setTab] = useState<"overview" | "settings">("overview");
  const [settingsTab, setSettingsTab] = useState("Connections");
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState<string[]>([]);
  const [videoTime, setVideoTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [history, setHistory] = useState(false);
  const [connectionStates, setConnectionStates] = useState<ConnectionStates>({});
  const [servicePulse, setServicePulse] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef("");
  const received = useRef("");
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [retry, setRetry] = useState(0);

  useEffect(() => { void managerApi<ConnectionStates>("connections").then(setConnectionStates).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | undefined;
    let requestNumber = 0;
    setError("");
    api<RuntimeSnapshot>("/api/sessions", {}).then(initial => {
      if (cancelled) return;
      session.current = initial.state.session_id;
      setSnapshot(initial);
      stream = new EventSource(`/api/sessions/${session.current}/stream`);
      stream.addEventListener("state", event => {
        if (cancelled) return;
        const next = JSON.parse((event as MessageEvent).data) as RuntimeSnapshot;
        setSnapshot(next);
        setConnected(true);
        const frame = next.latest_observation?.frame_id ?? "";
        if (frame && frame !== received.current) {
          received.current = frame;
          setPulse(["vision", "rules", ...(next.latest_mutations.length ? ["memory"] : [])]);
          clearTimeout(pulseTimer.current);
          pulseTimer.current = setTimeout(() => setPulse([]), 1100);
        }
        if (next.playback.status === "complete") video.current?.pause();
        const request = ++requestNumber;
        void api<{ events: TimelineEvent[] }>(`/api/sessions/${session.current}/events`).then(result => {
          if (!cancelled && request === requestNumber) setEvents(result.events);
        }).catch(reason => { if (!cancelled) setError(String(reason.message)); });
      });
      stream.onerror = () => setConnected(false);
    }).catch(reason => { if (!cancelled) setError(String(reason.message)); });
    return () => { cancelled = true; stream?.close(); clearTimeout(pulseTimer.current); if (session.current) void api(`/api/sessions/${session.current}/pause`, {}).catch(() => {}); };
  }, [retry]);

  async function runAction(action: string, body: unknown = {}) {
    if (!session.current) return;
    const next = await api<RuntimeSnapshot>(`/api/sessions/${session.current}/${action}`, body);
    setSnapshot(next);
    return next;
  }
  async function togglePlayback() {
    if (!video.current || busy || !connected) return;
    setBusy(true);
    try {
      if (snapshot?.playback.status === "playing") { video.current.pause(); await runAction("pause"); }
      else {
        if (snapshot?.playback.status === "complete") { await runAction("reset"); video.current.currentTime = 0; }
        video.current.playbackRate = speed;
        await video.current.play();
        await runAction("start", { speed });
      }
      setError("");
    } catch (reason) { video.current?.pause(); setError(reason instanceof Error ? reason.message : "Playback could not start."); }
    finally { setBusy(false); }
  }
  async function seek(value: number) {
    setBusy(true);
    try {
      await runAction("seek", { seconds: value });
      if (video.current) video.current.currentTime = value;
      setVideoTime(value);
      setSelected(null);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  function configure(section = "Connections") { setSettingsTab(section); setTab("settings"); }
  const playing = snapshot?.playback.status === "playing";
  const observation = snapshot?.latest_observation;
  const activity = [...events].reverse();
  const detail = selected ? eventCopy(selected.mutation) : null;
  const nodes: { id: string; name: string; note: string; icon: IconName; offline?: boolean }[] = [
    { id: "vision", name: "Vision", note: "Sample provider", icon: "eye" },
    { id: "memory", name: "Memory", note: "Current session", icon: "memory" },
    { id: "nimble", name: "Nimble", note: connectionStates.nimble?.verifiedAt ? "Search tested" : "Not connected", icon: "search", offline: !connectionStates.nimble?.verifiedAt },
    { id: "rawtree", name: "RawTree", note: connectionStates.rawtree?.verifiedAt ? "Read access tested" : "Not connected", icon: "memory", offline: !connectionStates.rawtree?.verifiedAt }
  ];
  return <div className="manager">
    <aside className="sidebar">
      <div className="wordmark"><span className="brand-icon"><Icon name="home" /></span>nightwatch<span className="brand-period">.</span></div>
      <nav className="main-nav" aria-label="Workspace">
        <button className={tab === "overview" ? "selected" : ""} onClick={() => setTab("overview")}><Icon name="home" />Overview</button>
        <button className={tab === "settings" ? "selected" : ""} onClick={() => configure()}><Icon name="settings" />Settings</button>
      </nav>
      <div className="connection-heading"><h2>Connections</h2><button aria-label="Configure connections" onClick={() => configure()}>+</button></div>
      <div className="connection-list">{nodes.map(node => <button key={node.id} title={`${node.name} · ${servicePulse === node.id ? "Request in progress" : pulse.includes(node.id) ? "Just updated" : node.note}`} aria-label={`${node.name}: ${node.note}`} onClick={() => node.id === "memory" ? (setTab("overview"), setHistory(true)) : configure(node.id === "rules" ? "Rules" : "Connections")} className={`connection-row ${pulse.includes(node.id) || servicePulse === node.id ? "working" : ""}`}>
        <Icon name={node.icon} /><span><strong>{node.name}</strong></span><i className={node.offline ? "offline" : connected ? "available" : "offline"} />
      </button>)}</div>
      <div className="sidebar-bottom"><span className={`service-dot ${connected ? "online" : ""}`} /><span>{connected ? "Local connection" : "Offline"}</span></div>
    </aside>
    <main className="main-content">
      {error && <div className="error-note" role="alert">{error}<button onClick={() => { setConnected(false); setRetry(value => value + 1); }}>Reconnect</button></div>}
      <div hidden={tab !== "overview"}>
        <div className="workspace-grid">
          <section className="camera-section" aria-label="Nursery camera">
            <div className="section-heading"><h1 className="camera-heading">Nursery</h1><span className="source-label">Recorded · sample observations</span></div>
            <div className="camera-stage">
              <video ref={video} src="/demo.mp4" poster="/nursery-poster.jpg" muted playsInline preload="auto" onTimeUpdate={event => { setVideoTime(Math.min(100, event.currentTarget.currentTime)); if (event.currentTarget.currentTime >= 100) event.currentTarget.pause(); }} onEnded={() => { void runAction("pause").catch(reason => setError(String(reason))); }} />
              {!playing && <button disabled={!connected || busy} className="camera-play" onClick={() => void togglePlayback()} aria-label="Play sample video"><Icon name="play" /></button>}
            </div>
            <div className="playback-controls">
              <button aria-label={playing ? "Stop playback" : "Play sample video"} disabled={!connected || busy} onClick={() => void togglePlayback()}><Icon name={playing ? "stop" : "play"} /></button>
              <input type="range" aria-label="Video position" min="0" max="100" step="2" value={videoTime} disabled={!connected || busy} onChange={event => setVideoTime(Number(event.target.value))} onPointerUp={event => void seek(Number(event.currentTarget.value))} onKeyUp={event => { if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) void seek(Number(event.currentTarget.value)); }} />
              <span>{time(videoTime)} / 1:40</span>
              <select aria-label="Playback speed" value={speed} onChange={event => { const value = Number(event.target.value); setSpeed(value); if (video.current) video.current.playbackRate = value; if (playing) void runAction("start", { speed: value }).catch(reason => setError(String(reason))); }}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
              <button aria-label="Restart video" disabled={!connected || busy} onClick={() => void seek(0)}><Icon name="reset" /></button>
            </div>
            <div className={`observation ${pulse.includes("vision") ? "recent" : ""}`}><Icon name="eye" /><p>{observation?.short_description ?? "Play to start observing."}</p></div>
          </section>
          <section className="activity-section" aria-label="Activity">
            <div className="section-heading"><h2>Activity</h2><span className="listening" aria-label={playing ? "Following activity" : "Ready"}><i className={playing ? "on" : ""} /></span></div>
            <div className="activity-list">
              {!activity.length && <p className="empty-activity">Activity will appear here.</p>}
              {activity.slice(0, history ? 50 : 4).map(event => { const copy = eventCopy(event.mutation); return <button className={`activity-event ${selected?.id === event.id ? "is-selected" : ""}`} key={event.id} onClick={() => setSelected(selected?.id === event.id ? null : event)}><span className={`event-dot ${event.mutation.type === "ALERT_EMITTED" ? "attention" : ""}`} /><span><span className="event-meta">{copy.source}<time>{time(event.video_timestamp)}</time></span><strong>{copy.title}</strong></span><Icon name="arrow" /></button>; })}
            </div>
            {detail && selected && <div className="event-detail"><div className="detail-title"><h3>Why this happened</h3><button aria-label="Close event details" onClick={() => setSelected(null)}><Icon name="close" /></button></div><dl><dt>Evidence</dt><dd>{selected.frame_id ?? "Monitoring rule"} · {time(selected.video_timestamp)}</dd><dt>Decision summary</dt><dd>{detail.detail}</dd><dt>Result</dt><dd>{detail.result}</dd></dl><small>Summary from recorded events, not model reasoning.</small></div>}
            {activity.length > 4 && <button className="quiet-link history-link" onClick={() => setHistory(!history)}>{history ? "Show recent activity" : `View all ${activity.length} events`}<Icon name="arrow" /></button>}
          </section>
        </div>
      </div>
      <section hidden={tab !== "settings"} className="settings-page">
        <div className="page-heading"><h1>Settings</h1><button className="quiet-link" onClick={() => setTab("overview")}>Back to overview <Icon name="arrow" /></button></div>
        <nav className="settings-tabs" aria-label="Settings sections">{["Connections", "Contacts", "Rules", "Demo assets"].map(item => <button key={item} aria-current={settingsTab === item ? "page" : undefined} className={settingsTab === item ? "active" : ""} onClick={() => { setSettingsTab(item); setDraft(""); }}>{item}</button>)}</nav>
        {settingsTab === "Connections" && <ConnectionsSettings onStates={setConnectionStates} onRequest={setServicePulse} />}
        {settingsTab === "Demo assets" && <DemoAssets rawtreeReady={Boolean(connectionStates.rawtree?.verifiedAt)} onRequest={setServicePulse} />}
        {settingsTab === "Contacts" && <><p className="draft-notice">Layout preview. Contacts are not saved and no messages are sent.</p><form className="contact-form" onSubmit={event => { event.preventDefault(); setDraft("Preview updated. This contact is not connected to notifications."); }}><label>Name<input name="name" required placeholder="e.g. Martin" /></label><label>Phone number<input name="phone" type="tel" required placeholder="+1 (555) 000-0000" /></label><label className="full-width">When to notify<textarea name="when" required placeholder="Notify first when a room check is needed." /></label><button className="primary-button" type="submit">Preview contact</button></form></>}
        {settingsTab === "Rules" && <><div className="rule-summary"><Icon name="rules" /><div><h3>Request a room review</h3><p>After a child has been outside a crib for 10 seconds, record an in-app alert. Two matching observations confirm a change.</p><span>Active in the local engine</span></div></div><form className="rule-form" onSubmit={event => { event.preventDefault(); setDraft("Rule preview updated. Shopping is not connected and this rule will not run."); }}><h3>Restock diapers</h3><p className="draft-notice">Example rule · Not active</p><label>When<input defaultValue="A caregiver confirms a diaper change" /></label><label>And<input defaultValue="Fewer than 6 diapers remain" /></label><label>Then<select defaultValue="review"><option value="review">Prepare an order for review</option><option value="auto">Buy within an approved budget</option></select></label><button className="primary-button">Preview rule</button></form></>}
        {draft && <p role="status" className="draft-feedback"><Icon name="check" />{draft}</p>}
      </section>
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Manager />);
