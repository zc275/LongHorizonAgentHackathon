import type { CandidateObservation, SessionState, StateMutation } from "./domain.js";

export type PlaybackStatus = "idle" | "playing" | "paused" | "complete";

export interface TimelineEvent {
  id: string;
  video_timestamp: number;
  frame_id: string | null;
  mutation: StateMutation;
}

export interface RuntimeSnapshot {
  state: SessionState & { last_video_timestamp: number | null };
  playback: {
    status: PlaybackStatus;
    current_time: number;
    speed: number;
    duration: number;
    sample_interval: number;
    provider: string;
  };
  latest_observation: CandidateObservation | null;
  latest_mutations: StateMutation[];
}
