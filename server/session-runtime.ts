import { EventEmitter } from "node:events";
import type { CandidateObservation, StateMutation } from "../shared/domain.js";
import type { PlaybackStatus, RuntimeSnapshot, TimelineEvent } from "../shared/api.js";
import {
  createMonitoringState,
  processObservation,
  type MonitoringEngineState
} from "./monitoring-engine.js";
import type { FrameSample, VisualObservationProvider } from "./providers/visual-observation-provider.js";

export class SessionRuntime extends EventEmitter {
  private state: MonitoringEngineState;
  private events: TimelineEvent[] = [];
  private latestObservation: CandidateObservation | null = null;
  private latestMutations: StateMutation[] = [];
  private status: PlaybackStatus = "idle";
  private currentTime = 0;
  private speed = 1;
  private timer: NodeJS.Timeout | null = null;
  private playStartedAtMs = 0;
  private playStartedAtVideoTime = 0;
  private processing = false;
  private pendingTimestamp: number | null = null;

  constructor(
    readonly id: string,
    private readonly provider: VisualObservationProvider,
    readonly sampleInterval = 2,
    readonly duration = 100
  ) {
    super();
    this.state = createMonitoringState(id);
  }

  snapshot(): RuntimeSnapshot {
    return {
      state: this.state,
      playback: {
        status: this.status,
        current_time: this.currentTime,
        speed: this.speed,
        duration: this.duration,
        sample_interval: this.sampleInterval,
        provider: this.provider.name
      },
      latest_observation: this.latestObservation,
      latest_mutations: this.latestMutations
    };
  }

  getEvents(after = 0): TimelineEvent[] {
    return this.events.filter((event) => event.video_timestamp >= after);
  }

  async processAt(videoTimestamp: number): Promise<void> {
    const timestamp = Math.max(0, Math.min(this.duration, videoTimestamp));
    if (this.processing) {
      this.pendingTimestamp = timestamp;
      return;
    }

    this.processing = true;
    try {
      const frame = this.frameAt(timestamp);
      const observation = await this.provider.observe(frame);
      const result = processObservation(this.state, observation);
      this.state = result.state;
      this.latestObservation = observation;
      this.latestMutations = result.mutations;
      this.currentTime = timestamp;
      for (const mutation of result.mutations) {
        this.events.push({
          id: `event_${this.events.length + 1}`,
          video_timestamp: timestamp,
          frame_id: mutation.type === "ALERT_EMITTED" ? null : observation.frame_id,
          mutation
        });
      }
      this.emit("update", this.snapshot());
    } finally {
      this.processing = false;
      if (this.pendingTimestamp !== null) {
        const pending = this.pendingTimestamp;
        this.pendingTimestamp = null;
        if (pending !== timestamp) await this.processAt(pending);
      }
    }
  }

  async processUntil(videoTimestamp: number): Promise<void> {
    const target = Math.max(0, Math.min(this.duration, videoTimestamp));
    const start = this.state.last_video_timestamp === null
      ? 0
      : Math.floor(this.state.last_video_timestamp / this.sampleInterval) * this.sampleInterval + this.sampleInterval;
    for (let timestamp = start; timestamp <= target; timestamp += this.sampleInterval) {
      await this.processAt(timestamp);
    }
    this.currentTime = target;
  }

  start(speed = this.speed): void {
    if (![1, 2, 4].includes(speed)) throw new Error("Playback speed must be 1, 2, or 4");
    this.stopTimer();
    this.speed = speed;
    this.status = "playing";
    this.playStartedAtMs = Date.now();
    this.playStartedAtVideoTime = this.currentTime;
    this.timer = setInterval(() => void this.tick(), 200);
    void this.tick();
    this.emit("update", this.snapshot());
  }

  pause(): void {
    if (this.status === "playing") this.syncCurrentTime();
    this.stopTimer();
    this.status = "paused";
    this.emit("update", this.snapshot());
  }

  async seek(videoTimestamp: number): Promise<void> {
    const wasPlaying = this.status === "playing";
    const speed = this.speed;
    this.stopTimer();
    this.resetState();
    await this.processUntil(videoTimestamp);
    this.status = "paused";
    if (wasPlaying) this.start(speed);
    else this.emit("update", this.snapshot());
  }

  reset(): void {
    this.stopTimer();
    this.resetState();
    this.emit("update", this.snapshot());
  }

  dispose(): void {
    this.stopTimer();
    this.removeAllListeners();
  }

  private resetState(): void {
    this.state = createMonitoringState(this.id);
    this.events = [];
    this.latestObservation = null;
    this.latestMutations = [];
    this.status = "idle";
    this.currentTime = 0;
    this.pendingTimestamp = null;
  }

  private frameAt(timestamp: number): FrameSample {
    const index = Math.round(timestamp / this.sampleInterval);
    return {
      frameId: `frame_${String(index).padStart(5, "0")}`,
      videoTimestamp: timestamp,
      evidenceThumbnailUrl: `/demo.mp4#t=${timestamp}`
    };
  }

  private syncCurrentTime(): void {
    const elapsed = (Date.now() - this.playStartedAtMs) / 1000;
    this.currentTime = Math.min(this.duration, this.playStartedAtVideoTime + elapsed * this.speed);
  }

  private async tick(): Promise<void> {
    if (this.status !== "playing") return;
    this.syncCurrentTime();
    const eligibleTimestamp = Math.floor(this.currentTime / this.sampleInterval) * this.sampleInterval;
    const lastTimestamp = this.state.last_video_timestamp ?? -this.sampleInterval;
    if (eligibleTimestamp > lastTimestamp) await this.processAt(eligibleTimestamp);
    if (this.currentTime >= this.duration) {
      this.stopTimer();
      this.status = "complete";
      this.emit("update", this.snapshot());
    }
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
