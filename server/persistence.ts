import type { CandidateObservation, StateMutation } from "../shared/domain.js";
import type { TimelineEvent } from "../shared/api.js";
import type { MonitoringEngineState } from "./monitoring-engine.js";
import type { RuntimePersistence, StoredRuntime } from "./session-runtime.js";
import { db } from "./db.js";

type JsonRow = { state_after_json: string };
type SnapshotRow = { state_json: string };
type EventRow = {
  id: number;
  video_timestamp: number;
  frame_id: string | null;
  mutation_json: string;
};

function situationId(mutation: StateMutation): string | null {
  if (mutation.type === "SITUATION_OPENED") return mutation.situation.id;
  if ("situationId" in mutation) return mutation.situationId;
  return null;
}

export class SqliteSessionPersistence implements RuntimePersistence {
  createSession(sessionId: string, provider: string): void {
    db.prepare(`
      INSERT INTO sessions (id, provider) VALUES (?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, updated_at = CURRENT_TIMESTAMP
    `).run(sessionId, provider);
  }

  recordSample(
    sessionId: string,
    provider: string,
    observation: CandidateObservation,
    mutations: StateMutation[],
    state: MonitoringEngineState,
    events: TimelineEvent[]
  ): void {
    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO observations
          (session_id, frame_id, video_timestamp, provider, payload_json)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionId, observation.frame_id, observation.observed_at_seconds, provider, JSON.stringify(observation));

      const eventStart = events.length - mutations.length;
      mutations.forEach((mutation, index) => {
        const event = events[eventStart + index];
        db.prepare(`
          INSERT INTO mutation_events
            (session_id, state_version, event_type, video_timestamp, frame_id, situation_id, mutation_json, state_after_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          state.state_version - mutations.length + index + 1,
          mutation.type,
          observation.observed_at_seconds,
          event?.frame_id ?? null,
          situationId(mutation),
          JSON.stringify(mutation),
          JSON.stringify(state)
        );
      });

      this.writeProjections(sessionId, observation.observed_at_seconds, state);
      db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    });
    transaction();
  }

  recordRestart(
    sessionId: string,
    mutations: StateMutation[],
    state: MonitoringEngineState,
    events: TimelineEvent[]
  ): void {
    const transaction = db.transaction(() => {
      mutations.forEach((mutation, index) => {
        const event = events[index];
        db.prepare(`
          INSERT INTO mutation_events
            (session_id, state_version, event_type, video_timestamp, frame_id, situation_id, mutation_json, state_after_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sessionId,
          state.state_version - mutations.length + index + 1,
          mutation.type,
          event.video_timestamp,
          event.frame_id,
          situationId(mutation),
          JSON.stringify(mutation),
          JSON.stringify(state)
        );
      });
      this.writeProjections(sessionId, events[0]?.video_timestamp ?? 0, state);
    });
    transaction();
  }

  loadSession(sessionId: string): StoredRuntime | null {
    const eventState = db.prepare(`
      SELECT state_after_json FROM mutation_events
      WHERE session_id = ? ORDER BY state_version DESC, id DESC LIMIT 1
    `).get(sessionId) as JsonRow | undefined;
    const latestSnapshot = db.prepare(`
      SELECT state_json FROM state_snapshots
      WHERE session_id = ? ORDER BY id DESC LIMIT 1
    `).get(sessionId) as SnapshotRow | undefined;
    if (!eventState && !latestSnapshot) return null;

    const reconstructed = JSON.parse(eventState?.state_after_json ?? latestSnapshot!.state_json) as MonitoringEngineState;
    if (latestSnapshot) {
      const latest = JSON.parse(latestSnapshot.state_json) as MonitoringEngineState;
      reconstructed.metrics = latest.metrics;
      reconstructed.last_video_timestamp = latest.last_video_timestamp;
      reconstructed.room.observed_at_seconds = latest.room.observed_at_seconds;
    }

    const rows = db.prepare(`
      SELECT id, video_timestamp, frame_id, mutation_json FROM mutation_events
      WHERE session_id = ? ORDER BY id ASC
    `).all(sessionId) as EventRow[];
    const events: TimelineEvent[] = rows.map((row, index) => ({
      id: `event_${index + 1}`,
      video_timestamp: row.video_timestamp,
      frame_id: row.frame_id,
      mutation: JSON.parse(row.mutation_json) as StateMutation
    }));
    return { state: reconstructed, events, currentTime: reconstructed.last_video_timestamp ?? 0 };
  }

  clearSessionData(sessionId: string): void {
    const transaction = db.transaction(() => {
      for (const table of ["observations", "mutation_events", "state_snapshots", "situations", "evidence_frames", "processing_metrics"]) {
        db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(sessionId);
      }
      db.prepare("UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(sessionId);
    });
    transaction();
  }

  private writeProjections(sessionId: string, timestamp: number, state: MonitoringEngineState): void {
    db.prepare(`
      INSERT INTO state_snapshots (session_id, state_version, video_timestamp, state_json)
      VALUES (?, ?, ?, ?)
    `).run(sessionId, state.state_version, timestamp, JSON.stringify(state));

    const upsertSituation = db.prepare(`
      INSERT INTO situations (session_id, situation_id, situation_type, status, state_json)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, situation_id) DO UPDATE SET
        status = excluded.status, state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
    `);
    const upsertEvidence = db.prepare(`
      INSERT OR IGNORE INTO evidence_frames
        (session_id, frame_id, video_timestamp, thumbnail_url, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const situation of state.situations) {
      upsertSituation.run(sessionId, situation.id, situation.type, situation.status, JSON.stringify(situation));
      for (const frameId of situation.evidence_frame_ids) {
        upsertEvidence.run(sessionId, frameId, timestamp, `/demo.mp4#t=${timestamp}`, JSON.stringify({ situation_id: situation.id }));
      }
    }

    db.prepare(`
      INSERT INTO processing_metrics (session_id, metrics_json) VALUES (?, ?)
      ON CONFLICT(session_id) DO UPDATE SET metrics_json = excluded.metrics_json, updated_at = CURRENT_TIMESTAMP
    `).run(sessionId, JSON.stringify(state.metrics));
  }
}
