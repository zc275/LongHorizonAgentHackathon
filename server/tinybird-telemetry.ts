import type { CandidateObservation, StateMutation } from "../shared/domain.js";
import type { MonitoringEngineState } from "./monitoring-engine.js";

export interface TelemetryEvent {
  event_id: string;
  event_time: string;
  session_id: string;
  event_type: string;
  video_timestamp: number;
  frame_id: string | null;
  situation_id: string | null;
  state_version: number;
  provider: string;
  processing_latency_ms: number;
  working_state_bytes: number;
  payload: string;
}

export interface TelemetrySink {
  readonly mode: "tinybird_live" | "tinybird_ready" | "tinybird_error" | "disabled";
  send(events: TelemetryEvent[]): Promise<void>;
}

export class DisabledTelemetrySink implements TelemetrySink {
  readonly mode = "disabled" as const;
  async send(_events: TelemetryEvent[]): Promise<void> {}
}

export class TinybirdTelemetrySink implements TelemetrySink {
  private currentMode: "tinybird_ready" | "tinybird_live" | "tinybird_error" = "tinybird_ready";
  private permanentlyBlocked = false;
  private retryAfter = 0;
  private readonly endpoint: string;

  get mode(): "tinybird_ready" | "tinybird_live" | "tinybird_error" {
    return this.currentMode;
  }

  constructor(
    private readonly token: string,
    baseUrl = "https://api.tinybird.co",
    private readonly dataSource = "nightwatch_state_changes"
  ) {
    this.endpoint = `${baseUrl.replace(/\/$/, "")}/v0/events?name=${encodeURIComponent(dataSource)}`;
  }

  async send(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0 || this.permanentlyBlocked || Date.now() < this.retryAfter) return;
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/x-ndjson"
        },
        body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) {
        const error = new Error(`Tinybird Events API returned HTTP ${response.status}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      this.currentMode = "tinybird_live";
      this.retryAfter = 0;
    } catch (error) {
      this.currentMode = "tinybird_error";
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : 0;
      if ([400, 401, 403, 404].includes(status)) this.permanentlyBlocked = true;
      else this.retryAfter = Date.now() + 30_000;
      throw error;
    }
  }
}

export function createTelemetrySink(): TelemetrySink {
  const token = (process.env.TINYBIRD_TOKEN ?? process.env.TINY_BIRD_API)?.trim();
  if (!token) return new DisabledTelemetrySink();
  return new TinybirdTelemetrySink(
    token,
    process.env.TINYBIRD_API_URL?.trim() || "https://api.tinybird.co",
    process.env.TINYBIRD_DATASOURCE?.trim() || "nightwatch_state_changes"
  );
}

function situationId(mutation: StateMutation): string | null {
  if (mutation.type === "SITUATION_OPENED") return mutation.situation.id;
  if ("situationId" in mutation) return mutation.situationId;
  return null;
}

export function buildTelemetryEvents(args: {
  sessionId: string;
  provider: string;
  observation: CandidateObservation;
  mutations: StateMutation[];
  state: MonitoringEngineState;
  processingLatencyMs: number;
}): TelemetryEvent[] {
  const { sessionId, provider, observation, mutations, state, processingLatencyMs } = args;
  const eventTime = new Date().toISOString();
  const base = {
    event_time: eventTime,
    session_id: sessionId,
    video_timestamp: observation.observed_at_seconds,
    provider,
    processing_latency_ms: processingLatencyMs,
    working_state_bytes: state.metrics.working_state_bytes
  };
  const events: TelemetryEvent[] = [{
    ...base,
    event_id: `${sessionId}:${observation.frame_id}:observation`,
    event_type: "OBSERVATION_PROCESSED",
    frame_id: observation.frame_id,
    situation_id: null,
    state_version: state.state_version,
    payload: "{}"
  }];
  mutations.forEach((mutation, index) => {
    const isAlert = mutation.type === "ALERT_EMITTED";
    events.push({
      ...base,
      event_id: `${sessionId}:${observation.frame_id}:mutation:${index}`,
      event_type: mutation.type,
      frame_id: isAlert ? null : observation.frame_id,
      situation_id: situationId(mutation),
      state_version: state.state_version - mutations.length + index + 1,
      payload: JSON.stringify(mutation)
    });
  });
  return events;
}
