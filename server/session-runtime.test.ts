import { describe, expect, it } from "vitest";
import { MockVisionProvider } from "./providers/mock-vision-provider.js";
import { SessionRuntime } from "./session-runtime.js";

describe("mock session runtime", () => {
  it("runs the complete fixture with resolution, recurrence, uncertainty, and one alert per episode", async () => {
    const runtime = new SessionRuntime("demo-test", new MockVisionProvider());
    await runtime.processUntil(100);

    const snapshot = runtime.snapshot();
    const childSituations = snapshot.state.situations.filter((item) => item.type === "child_out_of_crib");
    const childAlerts = runtime.getEvents().filter((event) => {
      const mutation = event.mutation;
      if (mutation.type !== "ALERT_EMITTED") return false;
      return childSituations.some((situation) => situation.id === mutation.situationId);
    });

    expect(childSituations).toHaveLength(2);
    expect(childSituations.every((item) => item.status === "resolved")).toBe(true);
    expect(childSituations[1].recurrence_of).toBe(childSituations[0].id);
    expect(childAlerts).toHaveLength(2);
    expect(runtime.getEvents().some((event) => event.mutation.type === "MONITORING_UNCERTAIN")).toBe(true);
    expect(snapshot.state.metrics.frames_sampled).toBe(51);
    expect(snapshot.state.metrics.observations_produced).toBe(51);
    expect(snapshot.state.metrics.repeated_observations_discarded).toBeGreaterThan(20);
    expect(snapshot.state.metrics.working_state_bytes).toBeLessThan(3_000);
  });

  it("replays deterministically when seeking", async () => {
    const runtime = new SessionRuntime("seek-test", new MockVisionProvider());
    await runtime.processUntil(60);
    const firstVersion = runtime.snapshot().state.state_version;
    const firstEvents = runtime.getEvents();

    await runtime.seek(60);

    expect(runtime.snapshot().state.state_version).toBe(firstVersion);
    expect(runtime.getEvents()).toEqual(firstEvents);
  });
});
