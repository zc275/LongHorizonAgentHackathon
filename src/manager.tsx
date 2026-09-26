import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { RuntimeSnapshot, TimelineEvent } from "../shared/api";
import type { StateMutation } from "../shared/domain";
import "./manager.css";
import { playLocalComfort, type ComfortAction } from "./comfort";
import { ManagerAlerts } from "./ManagerAlerts";
import { CameraSettings, usePhoneConnection } from "./PhoneConnection";
import { ConnectionsSettings, DemoAssets, managerApi, type ConnectionStates } from "./ManagerSetup";

type IconName = "home" | "settings" | "eye" | "search" | "memory" | "arrow" | "check" | "close" | "rules" | "cart" | "camera" | "speaker";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    speaker: <><path d="M3 9v6h4l5 4V5L7 9Z" /><path d="M16 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
    camera: <><path d="M8 6 10 3h4l2 3h5v15H3V6Z" /><circle cx="12" cy="13" r="4" /></>,
    cart: <><path d="M3 4h2l3 12h11l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="8" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    memory: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
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
function age(seconds: number) { const elapsed = Math.max(0, Math.floor(seconds)); return elapsed < 2 ? "Now" : elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed / 60)}m ago`; }
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
  const phoneCamera = usePhoneConnection();
  const phoneMode = phoneCamera.mode === "phone";
  const [tab, setTab] = useState<"overview" | "settings">("overview");
  const [settingsTab, setSettingsTab] = useState("Connections");
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [pulse, setPulse] = useState<string[]>([]);
  const [feedStatus, setFeedStatus] = useState<"connecting" | "observing" | "unavailable">("connecting");
  const [history, setHistory] = useState(false);
  const [connectionStates, setConnectionStates] = useState<ConnectionStates>({});
  const [servicePulse, setServicePulse] = useState<string | null>(null);
  const [connectionFocus, setConnectionFocus] = useState<{ id: string } | null>(null);
  const [shoppingPreview, setShoppingPreview] = useState<"running" | "complete" | null>(null);
  const shoppingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [liveVision, setLiveVision] = useState("");
  const [visionError, setVisionError] = useState("");
  const [visionWorking, setVisionWorking] = useState(false);
  const [comfortStatus, setComfortStatus] = useState("");
  const [comfortWorking, setComfortWorking] = useState(false);
  const [sessionNote, setSessionNote] = useState("");
  const [draft, setDraft] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef("");
  const restartFeed = useRef<() => void>(() => {});
  const received = useRef("");
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [retry, setRetry] = useState(0);

  useEffect(() => { void managerApi<ConnectionStates>("connections").then(setConnectionStates).catch(() => {}); }, []);
  useEffect(() => () => { clearTimeout(shoppingTimer.current); playLocalComfort("stop"); }, []);
  useEffect(() => {
    if (!phoneMode || phoneCamera.status !== "live" || !connectionStates.liquid?.verifiedAt || !phoneCamera.pair) {
      setLiveVision(""); setVisionWorking(false); return;
    }
    let cancelled = false; let working = false;
    const controller = new AbortController();
    const analyze = async () => {
      if (working || cancelled) return;
      working = true; setVisionWorking(true);
      try {
        const response = await fetch(`/api/camera/${phoneCamera.pair!.id}/analyze`, { method: "POST", headers: { Authorization: `Bearer ${phoneCamera.pair!.ownerToken}` }, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Vision request failed.");
        if (!cancelled) { setLiveVision(result.description); setVisionError(""); setPulse(["vision"]); setTimeout(() => setPulse([]), 1000); }
      } catch (reason) { if (!cancelled && !(reason instanceof DOMException && reason.name === "AbortError")) setVisionError(reason instanceof Error ? reason.message : "Vision request failed."); }
      finally { working = false; if (!cancelled) setVisionWorking(false); }
    };
    void analyze();
    const timer = setInterval(() => void analyze(), 12_000);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [phoneMode, phoneCamera.status, phoneCamera.pair?.id, connectionStates.liquid?.verifiedAt]);

  useEffect(() => {
    if (phoneMode) {
      setSnapshot(null); setEvents([]); setSelected(null); setPulse([]); setError("");
      return;
    }
    let cancelled = false;
    let stream: EventSource | undefined;
    let requestNumber = 0;
    setError("");
    setFeedStatus("connecting");
    api<RuntimeSnapshot>("/api/sessions", {}).then(initial => {
      if (cancelled) return;
      session.current = initial.state.session_id;
      setSnapshot(initial);
      let starting = false;
      const camera = video.current;
      const startFeed = async (restart = false) => {
        if (cancelled || starting || !camera) return;
        starting = true;
        setFeedStatus("connecting");
        try {
          if (restart) {
            await api(`/api/sessions/${initial.state.session_id}/reset`, {});
            if (cancelled) return;
            received.current = "";
            setEvents([]);
            setSelected(null);
          }
          camera.currentTime = 0;
          await camera.play();
          if (cancelled) { camera.pause(); return; }
          const next = await api<RuntimeSnapshot>(`/api/sessions/${initial.state.session_id}/start`, { speed: 1 });
          if (cancelled) {
            camera.pause();
            await api(`/api/sessions/${initial.state.session_id}/pause`, {});
            return;
          }
          setSnapshot(next);
          setFeedStatus("observing");
        } catch {
          camera.pause();
          if (!cancelled) {
            setFeedStatus("unavailable");
            setError("Camera preview could not start. Reconnect to try again.");
          }
        } finally { starting = false; }
      };
      restartFeed.current = () => { void startFeed(true); };
      stream = new EventSource(`/api/sessions/${session.current}/stream`);
      stream.addEventListener("state", event => {
        if (cancelled) return;
        const next = JSON.parse((event as MessageEvent).data) as RuntimeSnapshot;
        setSnapshot(next);
        setConnected(true);
        if (next.playback.status === "playing" && !camera?.paused) setFeedStatus("observing");
        const frame = next.latest_observation?.frame_id ?? "";
        if (frame && frame !== received.current) {
          received.current = frame;
          setPulse(["vision", "rules", ...(next.latest_mutations.length ? ["memory"] : [])]);
          clearTimeout(pulseTimer.current);
          pulseTimer.current = setTimeout(() => setPulse([]), 1100);
        }
        if (next.playback.status === "complete") restartFeed.current();
        const request = ++requestNumber;
        void api<{ events: TimelineEvent[] }>(`/api/sessions/${session.current}/events`).then(result => {
          if (!cancelled && request === requestNumber) setEvents(result.events);
        }).catch(reason => { if (!cancelled) { setFeedStatus("unavailable"); setError(String(reason.message)); } });
      });
      stream.onerror = () => { setConnected(false); setFeedStatus("unavailable"); };
      void startFeed();
    }).catch(reason => { if (!cancelled) { setFeedStatus("unavailable"); setError(String(reason.message)); } });
    return () => { cancelled = true; restartFeed.current = () => {}; video.current?.pause(); stream?.close(); clearTimeout(pulseTimer.current); if (session.current) void api(`/api/sessions/${session.current}/pause`, {}).catch(() => {}); };
  }, [retry, phoneMode]);

  function configure(section = "Connections", provider?: string) { setConnectionFocus(provider ? { id: provider } : null); setSettingsTab(section); setTab("settings"); }
  async function sessionCheck(action: "restart" | "occlusion") {
    if (!session.current || phoneMode || sessionBusy) return;
    setSessionBusy(true); setSessionNote("");
    try {
      if (action === "restart") video.current?.pause();
      const next = await api<RuntimeSnapshot>(`/api/sessions/${session.current}/${action}`, action === "occlusion" ? { enabled: !snapshot?.playback.manual_occlusion } : {});
      setSnapshot(next);
      if (action === "restart" && video.current) {
        video.current.currentTime = next.playback.current_time;
        await video.current.play();
        setSnapshot(await api<RuntimeSnapshot>(`/api/sessions/${session.current}/start`, { speed: 1 }));
        setSessionNote("Saved state restored. Fresh observations will confirm the room again.");
      } else setSessionNote(next.playback.manual_occlusion ? "View blocked. Monitoring uncertainty is retained." : "View restored. Waiting for confirmed observations.");
    } catch (reason) { setSessionNote(reason instanceof Error ? reason.message : "The session check failed."); }
    finally { setSessionBusy(false); }
  }
  async function comfort(action: ComfortAction) {
    if (comfortWorking) return;
    setComfortWorking(true);
    try {
      if (phoneMode) {
        if (!phoneCamera.pair || phoneCamera.status !== "live" || !phoneCamera.speakerReady) throw new Error("Enable sound on the connected phone first.");
        const response = await fetch(`/api/camera/${phoneCamera.pair.id}/action`, { method: "POST", headers: { Authorization: `Bearer ${phoneCamera.pair.ownerToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ type: action }) });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || "The phone did not accept the sound action."); }
      } else playLocalComfort(action);
      setComfortStatus(action === "stop" ? "Sound stopped" : action === "voice" ? "Speaking a calming phrase" : "Playing a lullaby");
      setServicePulse(action === "stop" ? null : "speaker");
      if (action !== "stop") setTimeout(() => setServicePulse(null), 6000);
    } catch (reason) { setComfortStatus(reason instanceof Error ? reason.message : "Sound action failed."); }
    finally { setComfortWorking(false); }
  }
  function previewShopping() {
    clearTimeout(shoppingTimer.current);
    setShoppingPreview("running");
    setTab("overview");
    shoppingTimer.current = setTimeout(() => setShoppingPreview("complete"), 2400);
  }
  const playing = phoneMode ? phoneCamera.status === "live" : feedStatus === "observing" && connected;
  const observation = snapshot?.latest_observation;
  const activity = [...events].reverse();
  const detail = selected ? eventCopy(selected.mutation) : null;
  const nimbleLive = snapshot?.integrations.nimble.mode === "nimble_live";
  const nimbleWorking = snapshot?.parent_notifications.some(item => item.research_provider === "nimble_live" && item.status === "researching");
  const nodes: { id: string; name: string; note: string; icon: IconName; offline?: boolean }[] = [
    { id: "camera", name: "Camera", note: phoneMode ? phoneCamera.status === "live" ? "Live" : "Connect phone" : "Sample footage", icon: "camera", offline: phoneCamera.status !== "live" },
    { id: "speaker", name: "Speaker", note: phoneMode ? phoneCamera.speakerReady ? "Phone sound ready" : "Enable on phone" : "Computer sound", icon: "speaker", offline: phoneMode && !phoneCamera.speakerReady },
    { id: "vision", name: "Vision", note: phoneMode ? connectionStates.liquid?.verifiedAt ? "Liquid AI descriptions" : "Connect Liquid AI" : "Sample provider", icon: "eye", offline: phoneMode && !connectionStates.liquid?.verifiedAt },
    { id: "memory", name: "Memory", note: phoneMode ? "No live analysis" : "Current session", icon: "memory", offline: phoneMode },
    { id: "nimble", name: "Nimble", note: nimbleWorking ? "Researching" : nimbleLive ? "Live research" : connectionStates.nimble?.verifiedAt ? "Search tested" : "Not connected", icon: "search", offline: !nimbleLive && !connectionStates.nimble?.verifiedAt },
    { id: "rawtree", name: "RawTree", note: connectionStates.rawtree?.verifiedAt ? "Read access tested" : "Not connected", icon: "memory", offline: !connectionStates.rawtree?.verifiedAt },
    { id: "instacart", name: "Instacart", note: "Not connected · Shopping preview", icon: "cart", offline: true }
  ];
  return <div className="manager">
    <aside className="sidebar">
      <nav className="main-nav" aria-label="Workspace">
        <button className={tab === "overview" ? "selected" : ""} onClick={() => setTab("overview")}><Icon name="home" />Overview</button>
        <button className={tab === "settings" ? "selected" : ""} onClick={() => configure()}><Icon name="settings" />Settings</button>
      </nav>
      <div className="connection-heading"><h2>Connections</h2><button aria-label="Configure connections" onClick={() => configure()}>+</button></div>
      <div className="connection-list">{nodes.map(node => <button key={node.id} title={`${node.name} · ${servicePulse === node.id ? "Request in progress" : pulse.includes(node.id) ? "Just updated" : node.note}`} aria-label={`${node.name}: ${node.note}`} onClick={() => node.id === "memory" ? (setTab("overview"), setHistory(true)) : node.id === "speaker" ? (setTab("overview"), document.getElementById("comfort-tools")?.scrollIntoView({ behavior: "smooth" })) : configure("Connections", node.id === "vision" ? "liquid" : node.id)} className={`connection-row ${pulse.includes(node.id) || servicePulse === node.id || (node.id === "nimble" && nimbleWorking) || (node.id === "instacart" && shoppingPreview === "running") ? "working" : ""}`}>
        <Icon name={node.icon} /><span><strong>{node.name}</strong>{node.id === "camera" && phoneCamera.status === "live" && <small>Live</small>}{node.id === "instacart" && shoppingPreview === "running" && <small>Previewing…</small>}</span><i className={node.offline ? "offline" : connected ? "available" : "offline"} />
      </button>)}</div>
      <div className="sidebar-bottom"><span className={`service-dot ${connected ? "online" : ""}`} /><span>{connected ? "Local connection" : "Offline"}</span></div>
    </aside>
    <main className="main-content">
      {error && <div className="error-note" role="alert">{error}<button onClick={() => { setConnected(false); setRetry(value => value + 1); }}>Reconnect</button></div>}
      <div hidden={tab !== "overview"}>
        <div className="workspace-grid">
          <section className="camera-section" aria-label="Nursery camera">
            <div className="section-heading"><h1 className="camera-heading">NurserAI</h1><span className={`feed-status ${playing ? "is-observing" : ""}`}><i />{phoneMode ? playing ? "Live" : phoneCamera.status === "stale" || phoneCamera.status === "error" ? "Connection lost" : "Waiting for camera" : playing ? "Observing" : feedStatus === "unavailable" ? "Connection lost" : "Connecting"}</span></div>
            <div className="camera-stage observer-stage">
              <video hidden={phoneMode} ref={video} src="/demo.mp4" poster="/nursery-poster.jpg" muted playsInline preload="auto" disablePictureInPicture onEnded={() => restartFeed.current()} onError={() => { if (phoneMode) return; setFeedStatus("unavailable"); setError("Camera source is unavailable. Reconnect to try again."); }} />
              {phoneMode && (phoneCamera.image && playing ? <img className="live-camera-image" src={phoneCamera.image} alt="Live view from your paired phone" /> : <div className="camera-waiting"><Icon name="camera" /><p>{phoneCamera.status === "stale" ? "Open the camera page on your phone" : phoneCamera.status === "error" ? "Connect your phone again" : "Your phone’s view will appear here"}</p><button className="secondary-button" onClick={() => configure("Connections", "camera")}>{phoneCamera.pair && phoneCamera.status !== "error" ? "Show pairing code" : "Connect camera"}</button></div>)}
              {(!phoneMode || playing) && <span className="camera-position">{phoneMode ? "Phone camera" : "Camera 01 · Room view"}</span>}
            </div>
            {!phoneMode && snapshot?.playback.manual_occlusion && <p className="view-uncertain">View blocked · Waiting for fresh evidence</p>}
            <div className={`observation ${pulse.includes("vision") ? "recent" : ""}`}><Icon name="eye" /><p>{phoneMode ? liveVision || (connectionStates.liquid?.verifiedAt ? visionWorking ? "Liquid AI is analyzing the live view…" : "Waiting for a model description…" : "Connect Liquid AI in Settings to analyze this camera.") : observation?.short_description ?? "Waiting for the next observation…"}</p></div>
            {phoneMode && visionError && <p className="view-uncertain" role="status">Liquid AI: {visionError}</p>}
            {!phoneMode && snapshot && <details className="room-context"><summary>Room context <span>{snapshot.state.room.stale ? "Needs confirmation" : `${snapshot.state.room.children_in_cribs ?? "—"} in cribs`}</span></summary><p>{snapshot.state.room.uncertainties.join(" ") || "Confirmed from repeated observations."}</p>{snapshot.state.situations.filter(item => item.status !== "resolved").map(item => <p key={item.id}>{words(item.type)} · {words(item.status)}</p>)}<small>{snapshot.state.metrics.frames_sampled} frames · {snapshot.state.metrics.repeated_observations_discarded} repeats discarded · State saved locally</small></details>}
          </section>
          <section className="activity-section" aria-label="Activity">
            <div className="section-heading"><h2>Activity</h2><span className="listening" aria-label={playing ? "Following activity" : "Ready"}><i className={playing ? "on" : ""} /></span></div>
            <ManagerAlerts notifications={snapshot?.parent_notifications ?? []} />
            <div className="activity-list">
              {phoneMode && <div className="shopping-activity"><Icon name="camera" /><div><span className="event-meta">Camera</span><strong>{playing ? "Phone camera connected" : phoneCamera.status === "stale" ? "Camera feed interrupted" : phoneCamera.status === "error" ? "Camera pairing ended" : phoneCamera.status === "off" ? "Camera disconnected" : "Waiting for your phone"}</strong><p>{playing ? "Live images · No recording" : "Open Camera in Connections to manage the feed."}</p></div></div>}
              {shoppingPreview && <div className={`shopping-activity ${shoppingPreview === "running" ? "is-running" : ""}`} role="status"><Icon name="cart" /><div><span className="event-meta">Instacart<span>Preview</span></span><strong>{shoppingPreview === "running" ? "Preparing diaper restock…" : "Diaper restock previewed"}</strong><p>No order placed.</p></div><button aria-label="Dismiss shopping preview" onClick={() => { clearTimeout(shoppingTimer.current); setShoppingPreview(null); }}><Icon name="close" /></button></div>}
              {!phoneMode && !activity.length && !shoppingPreview && <p className="empty-activity">Activity will appear here.</p>}
              {activity.slice(0, history ? 50 : 4).map(event => { const copy = eventCopy(event.mutation); return <button className={`activity-event ${selected?.id === event.id ? "is-selected" : ""}`} key={event.id} onClick={() => setSelected(selected?.id === event.id ? null : event)}><span className={`event-dot ${event.mutation.type === "ALERT_EMITTED" ? "attention" : ""}`} /><span><span className="event-meta">{copy.source}<time>{age((snapshot?.playback.current_time ?? 0) - event.video_timestamp)}</time></span><strong>{copy.title}</strong></span><Icon name="arrow" /></button>; })}
            </div>
            {detail && selected && <div className="event-detail"><div className="detail-title"><h3>Why this happened</h3><button aria-label="Close event details" onClick={() => setSelected(null)}><Icon name="close" /></button></div><dl><dt>Evidence</dt><dd>{selected.frame_id ?? "Monitoring rule"} · {time(selected.video_timestamp)}</dd><dt>Decision summary</dt><dd>{detail.detail}</dd><dt>Result</dt><dd>{detail.result}</dd></dl><small>Summary from recorded events, not model reasoning.</small></div>}
            <div className="comfort-tools" id="comfort-tools"><div className="comfort-heading"><Icon name="speaker" /><strong>Comfort tools</strong><span>Manual demo</span></div><p>Try these when the baby cries. The phone plays sound only after you enable it there.</p><div className="comfort-actions"><button disabled={comfortWorking || (phoneMode && !phoneCamera.speakerReady)} onClick={() => void comfort("lullaby")}>Play lullaby</button><button disabled={comfortWorking || (phoneMode && !phoneCamera.speakerReady)} onClick={() => void comfort("voice")}>Talk to baby</button><button disabled={comfortWorking || (phoneMode && !phoneCamera.speakerReady)} onClick={() => void comfort("stop")}>Stop</button></div>{comfortStatus && <small role="status">{comfortStatus}</small>}</div>
            {activity.length > 4 && <button className="quiet-link history-link" onClick={() => setHistory(!history)}>{history ? "Show recent activity" : `View all ${activity.length} events`}<Icon name="arrow" /></button>}
          </section>
        </div>
      </div>
      <section hidden={tab !== "settings"} className="settings-page">
        <div className="page-heading"><h1>Settings</h1><button className="quiet-link" onClick={() => setTab("overview")}>Back to overview <Icon name="arrow" /></button></div>
        <nav className="settings-tabs" aria-label="Settings sections">{["Connections", "Contacts", "Rules", "Demo assets"].map(item => <button key={item} aria-current={settingsTab === item ? "page" : undefined} className={settingsTab === item ? "active" : ""} onClick={() => { setSettingsTab(item); setDraft(""); }}>{item}</button>)}</nav>
        {settingsTab === "Connections" && <ConnectionsSettings onStates={setConnectionStates} onRequest={setServicePulse} focus={connectionFocus} onShoppingPreview={previewShopping} cameraSettings={(expanded, onToggle) => <CameraSettings camera={phoneCamera} expanded={expanded} onToggle={onToggle} />} />}
        {settingsTab === "Demo assets" && <><section className="asset-section"><h3>Session checks</h3><p>Check how the current sample session handles a blocked view and restores saved memory.</p><div className="setup-actions"><button className="secondary-button" disabled={phoneMode || sessionBusy || !snapshot} onClick={() => void sessionCheck("occlusion")}>{snapshot?.playback.manual_occlusion ? "Restore view" : "Block view"}</button><button className="secondary-button" disabled={phoneMode || sessionBusy || !snapshot} onClick={() => void sessionCheck("restart")}>Restore saved state</button></div>{phoneMode && <p className="draft-notice">These checks apply to sample footage. Switch back in Camera settings to use them.</p>}{sessionNote && <p className="setup-feedback" role="status">{sessionNote}</p>}</section><DemoAssets rawtreeReady={Boolean(connectionStates.rawtree?.verifiedAt)} onRequest={setServicePulse} /></>}
        {settingsTab === "Contacts" && <><p className="draft-notice">Layout preview. Contacts are not saved and no messages are sent.</p><form className="contact-form" onSubmit={event => { event.preventDefault(); setDraft("Preview updated. This contact is not connected to notifications."); }}><label>Name<input name="name" required placeholder="e.g. Martin" /></label><label>Phone number<input name="phone" type="tel" required placeholder="+1 (555) 000-0000" /></label><label className="full-width">When to notify<textarea name="when" required placeholder="Notify first when a room check is needed." /></label><button className="primary-button" type="submit">Preview contact</button></form></>}
        {settingsTab === "Rules" && <><div className="rule-summary"><Icon name="rules" /><div><h3>Request a room review</h3><p>After a child has been outside a crib for 10 seconds, record an in-app alert. Two matching observations confirm a change.</p><span>Active in the local engine</span></div></div><form className="rule-form" onSubmit={event => { event.preventDefault(); setDraft("Rule preview updated. Shopping is not connected and this rule will not run."); }}><h3>Restock diapers</h3><p className="draft-notice">Example rule · Not active</p><label>When<input defaultValue="A caregiver confirms a diaper change" /></label><label>And<input defaultValue="Fewer than 6 diapers remain" /></label><label>Then<select defaultValue="review"><option value="review">Prepare an order for review</option><option value="auto">Buy within an approved budget</option></select></label><button className="primary-button">Preview rule</button></form></>}
        {draft && <p role="status" className="draft-feedback"><Icon name="check" />{draft}</p>}
      </section>
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Manager />);
