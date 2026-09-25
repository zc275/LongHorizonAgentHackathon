export type KnownOrUnknown<T> = T | "unknown";

export type ActivityLevel = "quiet" | "moving" | "active_play";
export type CameraView = "usable" | "occluded" | "unusable" | "unknown";

export interface CandidateObservation {
  frame_id: string;
  observed_at_seconds: number;
  camera_view: CameraView;
  children_visible: KnownOrUnknown<number>;
  children_in_cribs: KnownOrUnknown<number>;
  children_outside_cribs: KnownOrUnknown<number>;
  caregiver_visible: KnownOrUnknown<boolean>;
  activity_level: KnownOrUnknown<ActivityLevel>;
  pillows_on_floor: KnownOrUnknown<boolean>;
  uncertainties: string[];
  short_description: string;
}

export interface RoomState {
  children_visible: KnownOrUnknown<number>;
  children_in_cribs: KnownOrUnknown<number>;
  children_outside_cribs: KnownOrUnknown<number>;
  caregiver_visible: KnownOrUnknown<boolean>;
  activity_level: KnownOrUnknown<ActivityLevel>;
  pillows_on_floor: KnownOrUnknown<boolean>;
  camera_view: CameraView;
  observed_at_seconds: number | null;
  stale: boolean;
  uncertainties: string[];
}

export type SituationType =
  | "child_out_of_crib"
  | "active_play_during_sleep_period"
  | "room_disrupted";

export type SituationStatus =
  | "pending"
  | "active"
  | "alerted"
  | "uncertain"
  | "resolved";

export interface Situation {
  id: string;
  type: SituationType;
  status: SituationStatus;
  started_at: number;
  updated_at: number;
  alerted_at: number | null;
  resolved_at: number | null;
  latest_evidence_frame_id: string;
  recurrence_of: string | null;
  peak_children_outside_cribs: number;
  caregiver_intervened: boolean;
  evidence_frame_ids: string[];
  alert_timer_paused_seconds: number;
  uncertainty_started_at: number | null;
}

export type StateMutation =
  | { type: "ROOM_STATE_CHANGED"; patch: Partial<RoomState>; evidenceFrameIds: string[] }
  | { type: "SITUATION_OPENED"; situation: Situation; evidenceFrameIds: string[] }
  | { type: "SITUATION_UPDATED"; situationId: string; patch: Partial<Situation>; evidenceFrameIds: string[] }
  | { type: "SITUATION_RESOLVED"; situationId: string; reason: string; evidenceFrameIds: string[] }
  | { type: "ALERT_EMITTED"; situationId: string }
  | { type: "MONITORING_UNCERTAIN"; reason: string; evidenceFrameIds: string[] };

export interface ProcessingMetrics {
  frames_sampled: number;
  observations_produced: number;
  mutations_accepted: number;
  repeated_observations_discarded: number;
  invalid_observations_rejected: number;
  working_state_bytes: number;
}

export interface SessionState {
  session_id: string;
  state_version: number;
  room: RoomState;
  situations: Situation[];
  metrics: ProcessingMetrics;
}

export const initialRoomState: RoomState = {
  children_visible: "unknown",
  children_in_cribs: "unknown",
  children_outside_cribs: "unknown",
  caregiver_visible: "unknown",
  activity_level: "unknown",
  pillows_on_floor: "unknown",
  camera_view: "unknown",
  observed_at_seconds: null,
  stale: true,
  uncertainties: ["Waiting for the first usable observation"]
};
