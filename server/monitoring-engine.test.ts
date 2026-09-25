import { describe, expect, it } from "vitest";
import type { CandidateObservation } from "../shared/domain.js";
import { createMonitoringState, processObservation } from "./monitoring-engine.js";

function observation(at: number, overrides: Partial<CandidateObservation> = {}): CandidateObservation {
  return {
    frame_id: `frame_${at}`,
    observed_at_seconds: at,
    camera_view: "usable",
    children_visible: 2,
    children_in_cribs: 2,
    children_outside_cribs: 0,
    caregiver_visible: false,
    activity_level: "quiet",
    pillows_on_floor: false,
    uncertainties: [],
    short_description: "Two children are quiet in their cribs.",
    ...overrides
  };
}

function feed(times: number[], overrides: Partial<CandidateObservation>, state = createMonitoringState("test")) {
  const mutations = [];
  for (const time of times) {
    const result = processObservation(state, observation(time, overrides));
    state = result.state;
    mutations.push(...result.mutations);
  }
  return { state, mutations };
}

describe("monitoring engine", () => {
  it("requires two compatible observations before changing canonical room state", () => {
    const first = processObservation(createMonitoringState("test"), observation(0));
    expect(first.mutations).toEqual([]);
    expect(first.state.room.children_visible).toBe("unknown");

    const second = processObservation(first.state, observation(2));
    expect(second.mutations.map((mutation) => mutation.type)).toEqual(["ROOM_STATE_CHANGED"]);
    expect(second.state.room.children_in_cribs).toBe(2);
  });

  it("opens, alerts exactly once, resolves, and links a recurrence", () => {
    let state = feed([0, 2], {}).state;
    let result = feed([14, 16], {
      children_in_cribs: 1,
      children_outside_cribs: 1,
      activity_level: "moving",
      short_description: "One child is outside a crib."
    }, state);
    state = result.state;
    const firstSituation = state.situations.find((item) => item.type === "child_out_of_crib")!;
    expect(firstSituation.status).toBe("active");

    result = feed([26, 28, 30], {
      children_in_cribs: 1,
      children_outside_cribs: 1,
      activity_level: "moving"
    }, state);
    state = result.state;
    expect(result.mutations.filter((mutation) => mutation.type === "ALERT_EMITTED")).toHaveLength(1);

    result = feed([40, 42], {}, state);
    state = result.state;
    expect(state.situations.find((item) => item.id === firstSituation.id)?.status).toBe("resolved");

    result = feed([56, 58], {
      children_in_cribs: 0,
      children_outside_cribs: 2,
      activity_level: "moving"
    }, state);
    const recurrence = result.state.situations.filter((item) => item.type === "child_out_of_crib").at(-1)!;
    expect(recurrence.id).not.toBe(firstSituation.id);
    expect(recurrence.recurrence_of).toBe(firstSituation.id);
  });

  it("marks uncertainty immediately and pauses the alert timer", () => {
    let state = feed([0, 2], {}).state;
    state = feed([14, 16], {
      children_in_cribs: 1,
      children_outside_cribs: 1,
      activity_level: "moving"
    }, state).state;

    const uncertain = processObservation(state, observation(20, {
      camera_view: "occluded",
      children_visible: "unknown",
      children_in_cribs: "unknown",
      children_outside_cribs: "unknown"
    }));
    expect(uncertain.mutations.some((mutation) => mutation.type === "MONITORING_UNCERTAIN")).toBe(true);
    expect(uncertain.state.situations.find((item) => item.type === "child_out_of_crib")?.status).toBe("uncertain");

    let resumed = processObservation(uncertain.state, observation(30, {
      children_in_cribs: 1,
      children_outside_cribs: 1,
      activity_level: "moving"
    }));
    resumed = processObservation(resumed.state, observation(32, {
      children_in_cribs: 1,
      children_outside_cribs: 1,
      activity_level: "moving"
    }));
    const situation = resumed.state.situations.find((item) => item.type === "child_out_of_crib")!;
    expect(situation.status).toBe("active");
    expect(situation.alerted_at).toBeNull();
    expect(situation.alert_timer_paused_seconds).toBe(12);
  });

  it("reports uncertainty when the first camera observation is unusable", () => {
    const result = processObservation(createMonitoringState("test"), observation(0, {
      camera_view: "unusable",
      children_visible: "unknown",
      children_in_cribs: "unknown",
      children_outside_cribs: "unknown"
    }));
    expect(result.mutations.map((mutation) => mutation.type)).toEqual(["MONITORING_UNCERTAIN"]);
    expect(result.state.room.camera_view).toBe("unusable");
  });

  it("rejects invalid provider output without mutating canonical state", () => {
    const before = createMonitoringState("test");
    const result = processObservation(before, { frame_id: "bad", camera_view: "clear" });
    expect(result.validationErrors.length).toBeGreaterThan(0);
    expect(result.state.state_version).toBe(0);
    expect(result.state.metrics.invalid_observations_rejected).toBe(1);
  });

  it("discards repeated observations while keeping working state bounded", () => {
    let state = feed([0, 2], {}).state;
    const initialBytes = state.metrics.working_state_bytes;
    state = feed(Array.from({ length: 100 }, (_, index) => 4 + index * 2), {}, state).state;
    expect(state.metrics.repeated_observations_discarded).toBeGreaterThanOrEqual(100);
    expect(state.metrics.working_state_bytes - initialBytes).toBeLessThan(100);
  });
});
