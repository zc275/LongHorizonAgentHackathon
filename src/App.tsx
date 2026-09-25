import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RuntimeSnapshot, TimelineEvent } from "../shared/api";
import type { Situation, StateMutation } from "../shared/domain";

const DEMO_VIDEO = "/demo.mp4";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: options?.body ? { "Content-Type": "application/json", ...options.headers } : options?.headers
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--";
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function mutationLabel(mutation: StateMutation): { title: string; detail: string } {
  switch (mutation.type) {
    case "ROOM_STATE_CHANGED": return { title: "Room state changed", detail: "Confirmed evidence updated the canonical state." };
    case "SITUATION_OPENED": return { title: `${humanize(mutation.situation.type)} opened`, detail: "A new unresolved situation entered working context." };
    case "SITUATION_UPDATED": return { title: "Situation updated", detail: `New supporting evidence for ${mutation.situationId}.` };
    case "SITUATION_RESOLVED": return { title: "Situation resolved", detail: mutation.reason };
    case "ALERT_EMITTED": return { title: "Alert emitted", detail: `One-time alert for ${mutation.situationId}.` };
    case "MONITORING_UNCERTAIN": return { title: "Monitoring uncertain", detail: mutation.reason };
  }
}

function Icon({ name }: { name: "play" | "pause" | "reset" | "activity" | "clock" }) {
  const paths = {
    play: <path d="m8 5 11 7-11 7V5Z" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    reset: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></>,
    activity: <path d="M3 12h4l2.2-6 4.2 12 2.2-6H21" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function EvidenceThumbnail({ timestamp }: { timestamp: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  return (
    <div className="evidence-thumb">
      <video ref={videoRef} src={`${DEMO_VIDEO}#t=${timestamp}`} muted preload="metadata"
        onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = timestamp; }} />
      <span>{formatTime(timestamp)}</span>
    </div>
  );
}

function SituationCard({ situation, currentTime }: { situation: Situation; currentTime: number }) {
  const duration = Math.max(0, (situation.resolved_at ?? currentTime) - situation.started_at - situation.alert_timer_paused_seconds);
  return (
    <article className={`situation-card ${situation.status}`}>
      <div className="situation-head">
        <span className="situation-icon"><Icon name="activity" /></span>
        <div><p>{humanize(situation.type)}</p><span className="mono">{situation.id}</span></div>
        <span className="status-pill">{situation.status}</span>
      </div>
      <div className="situation-stats">
        <div><span>Duration</span><strong>{formatTime(duration)}</strong></div>
        <div><span>Started</span><strong>{formatTime(situation.started_at)}</strong></div>
        <div><span>Evidence</span><strong>{situation.evidence_frame_ids.length}</strong></div>
      </div>
      <div className="situation-foot">
        <span>{situation.alerted_at === null ? "Alert pending" : `Alerted at ${formatTime(situation.alerted_at)}`}</span>
        {situation.recurrence_of && <span className="recurrence">Recurrence</span>}
      </div>
    </article>
  );
}

export function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [videoTime, setVideoTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const refreshEvents = useCallback(async (sessionId: string) => {
    const result = await api<{ events: TimelineEvent[] }>(`/api/sessions/${sessionId}/events`);
    setEvents(result.events);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<RuntimeSnapshot>("/api/sessions", { method: "POST" }).then((initial) => {
      if (cancelled) return;
      setSnapshot(initial);
      const source = new EventSource(`/api/sessions/${initial.state.session_id}/stream`);
      eventSourceRef.current = source;
      source.addEventListener("state", (event) => {
        const next = JSON.parse((event as MessageEvent).data) as RuntimeSnapshot;
        setSnapshot(next);
        setConnected(true);
        void refreshEvents(next.state.session_id).catch(() => undefined);
      });
      source.onerror = () => setConnected(false);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to create demo session"));
    return () => { cancelled = true; eventSourceRef.current?.close(); };
  }, [refreshEvents]);

  const control = useCallback(async (action: "start" | "pause" | "reset", body?: unknown) => {
    if (!snapshot) return;
    try {
      const next = await api<RuntimeSnapshot>(`/api/sessions/${snapshot.state.session_id}/${action}`, {
        method: "POST", body: body ? JSON.stringify(body) : undefined
      });
      setSnapshot(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Control request failed");
    }
  }, [snapshot]);

  const isPlaying = snapshot?.playback.status === "playing";
  const openSituations = snapshot?.state.situations.filter((situation) => situation.status !== "resolved") ?? [];
  const hasAlert = openSituations.some((situation) => situation.status === "alerted");
  const room = snapshot?.state.room;
  const metrics = snapshot?.state.metrics;
  const compression = metrics && metrics.frames_sampled > 0
    ? Math.max(0, Math.round((1 - metrics.mutations_accepted / metrics.frames_sampled) * 100)) : 0;
  const newestEvents = useMemo(() => [...events].reverse(), [events]);

  async function seek(seconds: number) {
    if (!snapshot) return;
    const next = await api<RuntimeSnapshot>(`/api/sessions/${snapshot.state.session_id}/seek`, {
      method: "POST", body: JSON.stringify({ seconds })
    });
    setSnapshot(next);
    await refreshEvents(snapshot.state.session_id);
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video || !snapshot) return;
    if (isPlaying) {
      video.pause();
      await control("pause");
      return;
    }
    if (snapshot.playback.status === "complete" || video.currentTime >= 100) {
      video.currentTime = 0;
      setVideoTime(0);
      await seek(0);
    }
    video.playbackRate = speed;
    await video.play();
    await control("start", { speed });
  }

  async function reset() {
    videoRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setVideoTime(0);
    setEvents([]);
    await control("reset");
  }

  function changeSpeed(nextSpeed: number) {
    setSpeed(nextSpeed);
    if (videoRef.current) videoRef.current.playbackRate = nextSpeed;
    if (isPlaying) void control("start", { speed: nextSpeed });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">N</div>
        <div className="brand-copy"><p className="eyebrow">Long-horizon visual agent</p><h1>Nightwatch</h1></div>
        <div className="mode-chip"><span /> Demo mode · Mock vision</div>
        <div className={`connection ${connected ? "online" : ""}`}><span className="status-dot" />{connected ? "Pipeline online" : "Connecting"}</div>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {hasAlert && <div className="alert-banner"><span className="alert-pulse" /><div><strong>Attention required</strong><p>A child has remained outside a crib past the alert threshold.</p></div><span className="mono">ONE-TIME ALERT</span></div>}

      <section className="dashboard-grid">
        <div className="primary-column">
          <section className="panel video-panel">
            <div className="panel-heading"><div><p className="eyebrow">Live source</p><h2>Nursery camera</h2></div><span className="recording"><i /> Processing every 2s</span></div>
            <div className="video-stage" onClick={() => void togglePlayback()}>
              <video ref={videoRef} src={DEMO_VIDEO} preload="metadata" playsInline muted
                onTimeUpdate={(event) => setVideoTime(Math.min(100, event.currentTarget.currentTime))}
                onEnded={() => void control("pause")} />
              {!isPlaying && <button className="center-play" aria-label="Play demo"><Icon name="play" /></button>}
              <div className="camera-overlay top-left"><span>CAM 01</span><strong>NURSERY</strong></div>
              <div className="camera-overlay top-right mono">{formatTime(videoTime)} / 1:40</div>
              {snapshot?.state.last_video_timestamp !== null && snapshot && <div className="processed-marker mono">PROCESSED {formatTime(snapshot.state.last_video_timestamp)}</div>}
              <div className="frame-corners" />
            </div>
            <div className="video-controls">
              <button className="icon-button" onClick={() => void togglePlayback()} aria-label={isPlaying ? "Pause" : "Play"}><Icon name={isPlaying ? "pause" : "play"} /></button>
              <span className="mono timecode">{formatTime(videoTime)}</span>
              <input className="timeline-range" type="range" min="0" max="100" step="0.1" value={videoTime}
                style={{ "--progress": `${videoTime}%` } as CSSProperties}
                onChange={(event) => { const next = Number(event.target.value); setVideoTime(next); if (videoRef.current) videoRef.current.currentTime = next; }}
                onPointerUp={(event) => void seek(Number(event.currentTarget.value))}
                onKeyUp={(event) => void seek(Number(event.currentTarget.value))} aria-label="Video position" />
              <span className="mono timecode">1:40</span>
              <div className="speed-control">{[1, 2, 4].map((value) => <button key={value} className={speed === value ? "active" : ""} onClick={() => changeSpeed(value)}>{value}×</button>)}</div>
              <button className="icon-button subtle" onClick={() => void reset()} title="Reset session" aria-label="Reset session"><Icon name="reset" /></button>
            </div>
          </section>

          <section className="panel timeline-panel">
            <div className="panel-heading"><div><p className="eyebrow">Append-only journal</p><h2>Meaningful timeline</h2></div><span className="event-count mono">{events.length} EVENTS</span></div>
            <div className="event-list">
              {newestEvents.length === 0 && <div className="empty-state"><Icon name="clock" /><p>Timeline events will appear as confirmed state changes occur.</p></div>}
              {newestEvents.map((event) => {
                const label = mutationLabel(event.mutation);
                return <article className={`event-row ${event.mutation.type.toLowerCase()}`} key={event.id}>
                  <EvidenceThumbnail timestamp={event.video_timestamp} /><div className="event-line"><i /></div>
                  <div className="event-copy"><div><strong>{label.title}</strong><span className="mono">{event.frame_id ?? "rule engine"}</span></div><p>{label.detail}</p></div>
                  <time className="mono">{formatTime(event.video_timestamp)}</time>
                </article>;
              })}
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className={`panel state-panel ${room?.camera_view !== "usable" ? "uncertain" : ""}`}>
            <div className="panel-heading compact"><div><p className="eyebrow">Canonical state</p><h2>Current room</h2></div><span className={`freshness ${room?.stale ? "stale" : ""}`}><i />{room?.stale ? "Uncertain" : "Fresh"}</span></div>
            <div className="count-grid">
              <div className="hero-count"><strong>{room?.children_visible ?? "—"}</strong><span>Visible</span></div>
              <div><strong>{room?.children_in_cribs ?? "—"}</strong><span>In cribs</span></div>
              <div className={(typeof room?.children_outside_cribs === "number" && room.children_outside_cribs > 0) ? "danger" : ""}><strong>{room?.children_outside_cribs ?? "—"}</strong><span>Outside</span></div>
            </div>
            <dl className="state-list">
              <div><dt>Activity</dt><dd><span className={`activity-dot ${room?.activity_level}`} />{humanize(String(room?.activity_level ?? "unknown"))}</dd></div>
              <div><dt>Caregiver</dt><dd>{room?.caregiver_visible === true ? "Visible" : room?.caregiver_visible === false ? "Not visible" : "Unknown"}</dd></div>
              <div><dt>Pillows</dt><dd>{room?.pillows_on_floor === true ? "On floor" : room?.pillows_on_floor === false ? "In place" : "Unknown"}</dd></div>
              <div><dt>Camera</dt><dd>{humanize(room?.camera_view ?? "unknown")}</dd></div>
              <div><dt>Observed</dt><dd className="mono">{formatTime(room?.observed_at_seconds ?? null)}</dd></div>
            </dl>
            {room?.uncertainties && room.uncertainties.length > 0 && <p className="uncertainty-note">{room.uncertainties.join(" ")}</p>}
          </section>

          <section className="panel situations-panel">
            <div className="panel-heading compact"><div><p className="eyebrow">Unresolved context</p><h2>Open situations</h2></div><span className="situation-total">{openSituations.length}</span></div>
            <div className="situation-stack">
              {openSituations.length === 0 && <div className="all-clear"><span>✓</span><strong>All clear</strong><p>No unresolved situations.</p></div>}
              {openSituations.map((situation) => <SituationCard key={situation.id} situation={situation} currentTime={videoTime} />)}
            </div>
          </section>

          <section className="panel metrics-panel">
            <div className="panel-heading compact"><div><p className="eyebrow">Context efficiency</p><h2>Compression</h2></div><strong className="compression-score">{compression}%</strong></div>
            <div className="compression-track"><span style={{ width: `${compression}%` }} /></div>
            <p className="metric-caption">Repeated visual evidence is discarded while explicit state remains small.</p>
            <div className="metric-grid">
              <div><span>Frames</span><strong>{metrics?.frames_sampled ?? 0}</strong></div><div><span>Observations</span><strong>{metrics?.observations_produced ?? 0}</strong></div>
              <div><span>Mutations</span><strong>{metrics?.mutations_accepted ?? 0}</strong></div><div><span>Discarded</span><strong>{metrics?.repeated_observations_discarded ?? 0}</strong></div>
            </div>
            <div className="working-size"><span>Serialized working state</span><strong className="mono">{metrics?.working_state_bytes ?? 0} B</strong></div>
          </section>

          <details className="panel developer-panel"><summary><span>Developer diagnostics</span><span className="mono">JSON</span></summary><pre>{JSON.stringify({ observation: snapshot?.latest_observation, mutations: snapshot?.latest_mutations }, null, 2)}</pre></details>
        </aside>
      </section>
    </main>
  );
}
