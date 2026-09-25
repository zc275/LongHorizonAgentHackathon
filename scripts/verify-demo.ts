import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MockVisionProvider } from "../server/providers/mock-vision-provider.js";
import { SqliteSessionPersistence } from "../server/persistence.js";
import { SessionRuntime } from "../server/session-runtime.js";

const fullDemo = new SessionRuntime("verification-full-demo", new MockVisionProvider());
await fullDemo.processUntil(100);

const snapshot = fullDemo.snapshot();
const childSituations = snapshot.state.situations.filter((item) => item.type === "child_out_of_crib");
const childSituationIds = new Set(childSituations.map((item) => item.id));
const childAlerts = fullDemo.getEvents().filter((event) =>
  event.mutation.type === "ALERT_EMITTED" && childSituationIds.has(event.mutation.situationId)
);

assert.equal(snapshot.state.metrics.frames_sampled, 51, "Expected 51 two-second samples");
assert.equal(snapshot.state.metrics.observations_produced, 51, "Every sample should produce an observation");
assert.equal(childSituations.length, 2, "Expected an initial episode and one recurrence");
assert.ok(childSituations.every((item) => item.status === "resolved"), "Both child situations should resolve");
assert.equal(childSituations[1].recurrence_of, childSituations[0].id, "Recurrence must link to the first episode");
assert.equal(childAlerts.length, 2, "Each child situation should alert exactly once");
assert.ok(fullDemo.getEvents().some((event) => event.mutation.type === "MONITORING_UNCERTAIN"), "Occlusion should produce uncertainty");
assert.ok(snapshot.state.metrics.repeated_observations_discarded > 30, "Repeated observations should be discarded");
assert.ok(snapshot.state.metrics.working_state_bytes < 4_000, "Working state should remain bounded");

const restartDemo = new SessionRuntime(
  `verification-restart-${randomUUID()}`,
  new MockVisionProvider(),
  2,
  100,
  new SqliteSessionPersistence()
);
await restartDemo.processUntil(24);
restartDemo.simulateRestart();
assert.equal(restartDemo.snapshot().state.room.stale, true, "Restored state must be stale");
await restartDemo.processAt(26);
assert.equal(restartDemo.snapshot().state.room.stale, true, "One fresh observation must remain provisional");
await restartDemo.processAt(28);
assert.equal(restartDemo.snapshot().state.room.stale, false, "Two fresh observations should restore confidence");
assert.equal(restartDemo.getEvents().filter((event) => event.mutation.type === "ALERT_EMITTED").length, 0, "Recovery must not alert immediately");
await restartDemo.processAt(30);
assert.equal(restartDemo.getEvents().filter((event) => event.mutation.type === "ALERT_EMITTED").length, 1, "Alert should fire after confirmed active video time");
restartDemo.reset();

console.log(JSON.stringify({
  result: "PASS",
  frames_sampled: snapshot.state.metrics.frames_sampled,
  observations_produced: snapshot.state.metrics.observations_produced,
  mutations_accepted: snapshot.state.metrics.mutations_accepted,
  observations_discarded: snapshot.state.metrics.repeated_observations_discarded,
  working_state_bytes: snapshot.state.metrics.working_state_bytes,
  child_situations: childSituations.length,
  child_alerts: childAlerts.length,
  recurrence_linked: childSituations[1].recurrence_of === childSituations[0].id,
  uncertainty_verified: true,
  restart_recovery_verified: true
}, null, 2));
