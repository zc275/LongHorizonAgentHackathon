import type { CandidateObservation } from "../../shared/domain.js";

export interface FrameSample {
  frameId: string;
  videoTimestamp: number;
  evidenceThumbnailUrl?: string;
}

export interface VisualObservationProvider {
  readonly name: string;
  observe(frame: FrameSample): Promise<CandidateObservation>;
}
