import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { MockVisionProvider } from "./providers/mock-vision-provider.js";
import { SqliteSessionPersistence } from "./persistence.js";
import { SessionRuntime } from "./session-runtime.js";
import type { AlertEnricher } from "./alert-enrichment.js";

const fakeAlertEnricher: AlertEnricher = {
  mode: "nimble_live",
  async enrich() {
    return {
      message: "Please check the nursery now.",
      research_summary: "Vetted safety guidance found.",
      sources: [{ title: "Safety source", url: "https://example.com/safety", snippet: "Guidance" }]
    };
  }
};

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

  it("restores from SQLite as uncertain and waits for fresh confirmation before alerting", async () => {
    const runtime = new SessionRuntime(
      `restart-${randomUUID()}`,
      new MockVisionProvider(),
      2,
      100,
      new SqliteSessionPersistence()
    );
    await runtime.processUntil(24);
    const beforeRestart = runtime.snapshot();
    expect(beforeRestart.state.situations.find((item) => item.type === "child_out_of_crib")?.status).toBe("active");

    runtime.simulateRestart();
    expect(runtime.snapshot().state.room.stale).toBe(true);
    expect(runtime.snapshot().state.situations.find((item) => item.type === "child_out_of_crib")?.status).toBe("uncertain");

    await runtime.processAt(26);
    expect(runtime.snapshot().state.room.stale).toBe(true);
    expect(runtime.getEvents().filter((event) => event.mutation.type === "ALERT_EMITTED")).toHaveLength(0);

    await runtime.processAt(28);
    expect(runtime.snapshot().state.room.stale).toBe(false);
    expect(runtime.getEvents().filter((event) => event.mutation.type === "ALERT_EMITTED")).toHaveLength(0);

    await runtime.processAt(30);
    expect(runtime.getEvents().filter((event) => event.mutation.type === "ALERT_EMITTED")).toHaveLength(1);
    runtime.reset();
  });

  it("routes the manual occlusion control through the provider and reconciler", async () => {
    const runtime = new SessionRuntime("occlusion-test", new MockVisionProvider());
    await runtime.processUntil(2);
    expect(runtime.snapshot().state.room.camera_view).toBe("usable");

    runtime.setTemporaryOcclusion(true);
    await runtime.processAt(4);
    expect(runtime.snapshot().playback.manual_occlusion).toBe(true);
    expect(runtime.snapshot().state.room.camera_view).toBe("occluded");

    runtime.setTemporaryOcclusion(false);
    await runtime.processAt(6);
    expect(runtime.snapshot().state.room.camera_view).toBe("occluded");
    await runtime.processAt(8);
    expect(runtime.snapshot().state.room.camera_view).toBe("usable");
    expect(runtime.snapshot().state.room.stale).toBe(false);
  });

  it("enriches each deterministic alert once and places a parent message in the outbox", async () => {
    const runtime = new SessionRuntime("notification-test", new MockVisionProvider(), 2, 100, undefined, fakeAlertEnricher);
    await runtime.processUntil(30);
    await Promise.resolve();

    const notifications = runtime.snapshot().parent_notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      status: "sent",
      channel: "in_app_demo",
      research_provider: "nimble_live",
      research_summary: "Vetted safety guidance found."
    });
    expect(notifications[0].sources).toHaveLength(1);
  });
});
