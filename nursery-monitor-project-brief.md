# Project Brief: Long-Horizon Nursery Activity Monitor

You are a Codex coding agent. Build this project end to end in the current repository. Do not stop after writing a plan. Inspect the repository first, preserve any existing useful structure, implement the application, run it, and verify the principal demo flow. If the repository is empty, scaffold the smallest practical full-stack application.

## Product idea

Build a visual monitoring system that turns a long video stream into a small, durable representation of the situations that are currently unresolved.

For the demo, process nursery-camera footage in which two toddlers repeatedly climb out of their cribs, move pillows, play, and are returned to bed by a caregiver. The system should discard repetitive frames while preserving meaningful state transitions, such as:

- children initially in their cribs;
- one or more children leaving their cribs;
- play activity beginning;
- pillows or room objects being moved;
- a caregiver entering and intervening;
- the children returning to their cribs;
- activity recurring after the apparent resolution.

The system is an activity journal and context-management demonstration. Do not make medical claims, attempt breathing detection, recognize identities, or present the application as a certified safety device.

Suggested public demo source:

https://globalnews.ca/video/3321270/twin-toddlers-slumber-party-caught-on-nanny-cam

The application must also accept a user-supplied local MP4 because remote playback, downloading, and CORS behavior may vary. Expect a file such as `public/demo.mp4`, but do not fail to start if it is absent. Provide a clear upload or file-selection path and a mock-event mode for development.

## Core claim

The application should demonstrate this architectural claim:

> A long-running visual agent should maintain explicit, mutable situation state rather than repeatedly sending its entire observation history to a model.

Hundreds of frames may produce only a handful of meaningful mutations. The event history remains available for audit, while the working context stays compact.

## Required user experience

Create a single dashboard with four main areas:

1. **Video**
   - Play, pause, seek, and playback-speed controls.
   - Indicate the latest frame processed by the monitoring pipeline.
   - Allow an MP4 upload or selection of a configured demo video.

2. **Current room state**
   - Number of children visible.
   - Number of children in cribs.
   - Number of children outside cribs.
   - Whether a caregiver is visible.
   - Approximate activity level: `quiet`, `moving`, or `active_play`.
   - Room-object state relevant to the demo, such as `pillows_on_floor`.
   - Observation freshness and uncertainty.

3. **Open situations**
   - Show unresolved situations as cards with a live duration.
   - Initial situation types:
     - `child_out_of_crib`
     - `active_play_during_sleep_period`
     - `room_disrupted`
   - Show status, start time, latest supporting evidence, and whether an alert has been emitted.

4. **Timeline and context metrics**
   - Show meaningful events in chronological order with evidence thumbnails.
   - Show total frames sampled, observations produced, state mutations accepted, repeated observations discarded, and current serialized working-state size.
   - Make it visually obvious that many frames collapse into a small number of state transitions.

The UI should be polished enough for a three-minute hackathon demo. Prefer a dark monitoring-console aesthetic, large status cards, an obvious alert state, and a timeline that updates during playback.

## Architecture

Implement these components behind clean interfaces:

```text
Video source
    -> frame sampler
    -> visual observation provider
    -> observation validator
    -> temporal reconciler / state reducer
    -> canonical scene state
    -> situation rules and timers
    -> dashboard, timeline, and alerts

Every accepted observation and mutation
    -> append-only event log
    -> optional Tinybird analytics sink
```

### Frame sampler

- Sample according to video time, initially every 2 seconds.
- Keep at most one model request in flight. If processing falls behind, skip to the newest eligible frame instead of creating an unbounded queue.
- Assign every sample a stable frame ID and video timestamp.
- Extract or retain an evidence thumbnail for meaningful state transitions.
- Ensure timers use video timestamps rather than wall-clock timestamps so seeking and accelerated playback remain coherent.

### Visual observation provider

Create a provider interface so model integrations can be swapped:

```ts
interface VisualObservationProvider {
  observe(frame: FrameSample): Promise<CandidateObservation>;
}
```

Support two implementations:

1. `LiquidVisionProvider`: use the Liquid vision-language model or API made available in the hackathon environment. Inspect existing environment variables and the current official integration instructions before choosing the exact client. Require structured JSON output. Keep all provider-specific code in one module.
2. `MockVisionProvider`: return timestamp-driven observations from a fixture file. This must allow the complete demo and UI to run without external credentials.

The vision model reports only visible facts. It must not decide whether to alert. Use this schema or an equivalent strongly typed schema:

```json
{
  "frame_id": "frame_00042",
  "observed_at_seconds": 42.0,
  "camera_view": "usable",
  "children_visible": 2,
  "children_in_cribs": 0,
  "children_outside_cribs": 2,
  "caregiver_visible": false,
  "activity_level": "active_play",
  "pillows_on_floor": true,
  "uncertainties": [],
  "short_description": "Two children are playing on the floor near a pile of pillows."
}
```

Every categorical field must support `unknown`, and `camera_view` must support `occluded` and `unusable`. Validate model output before it reaches canonical state.

Do not require face recognition or stable child identities. Counts and locations are sufficient for the MVP.

### Temporal reconciler and mutations

Maintain canonical state separately from raw observations. A single model output should normally be treated as provisional. Require two compatible usable observations before changing important room state, with the confirmation count configurable.

Represent changes as explicit typed mutations:

```ts
type StateMutation =
  | { type: "ROOM_STATE_CHANGED"; patch: Partial<RoomState>; evidenceFrameIds: string[] }
  | { type: "SITUATION_OPENED"; situation: Situation; evidenceFrameIds: string[] }
  | { type: "SITUATION_UPDATED"; situationId: string; patch: Partial<Situation>; evidenceFrameIds: string[] }
  | { type: "SITUATION_RESOLVED"; situationId: string; reason: string; evidenceFrameIds: string[] }
  | { type: "ALERT_EMITTED"; situationId: string }
  | { type: "MONITORING_UNCERTAIN"; reason: string; evidenceFrameIds: string[] };
```

Repeated observations that do not change canonical state should increment a discarded/redundant counter without adding prose to working context.

Preserve the distinction between:

- currently observed state;
- last known state;
- unknown state caused by occlusion or stale observations.

Do not interpret missing visibility as resolution.

### Situation state machine

Implement situation rules in deterministic application code. Initial behavior:

- Open `child_out_of_crib` when at least one child is confirmed outside a crib.
- Update the same situation while the condition continues. Do not open duplicates.
- Emit one visible alert after the condition persists for a configurable duration, initially 10 seconds of video time.
- Resolve the situation when all visible children are confirmed back in cribs.
- If children leave again after resolution, open a new situation linked to the prior one through `recurrence_of`.
- Record caregiver entry and intervention as evidence, but do not assume the situation is resolved until the visual state confirms it.
- Mark monitoring uncertain when the camera becomes unusable or observations become stale. Pause alert timers during uncertainty.

Use explicit lifecycle states:

```text
pending -> active -> alerted -> resolved
                  -> uncertain -> active
```

### Persistence

Use SQLite as the local authoritative store unless the existing project already has a suitable database. Persist:

- observations;
- accepted mutations;
- canonical state snapshots;
- situations;
- evidence-frame metadata;
- processing metrics.

The append-only event log must allow the canonical state to be reconstructed. On process restart, restore the latest state, mark it stale, and wait for fresh observations before emitting any new alert.

If Tinybird credentials are present, send observation and mutation telemetry asynchronously. Tinybird failure must not interrupt monitoring. Expose at least these event fields:

```text
session_id
event_type
video_timestamp
frame_id
situation_id
state_version
provider
processing_latency_ms
working_state_bytes
```

## Context management

Maintain three separate layers:

1. **Raw observations:** append-only and queryable, but excluded from routine reasoning context.
2. **Canonical working state:** small, mutable, and loaded for every decision.
3. **Episode summaries:** created when a situation resolves and retained for recurrence/history queries.

An episode summary should be structured:

```json
{
  "situation_type": "child_out_of_crib",
  "started_at": 18.0,
  "alerted_at": 28.0,
  "resolved_at": 46.0,
  "peak_children_outside_cribs": 2,
  "caregiver_intervened": true,
  "recurrence_count": 0,
  "evidence_frame_ids": ["frame_00009", "frame_00014", "frame_00023"]
}
```

If a frontier reasoning model is available, use it only for an optional `Explain what happened` endpoint. Supply current state, relevant mutations, the episode summaries, and selected evidence frames. Do not send the complete frame history. The rule engine remains authoritative for alerts.

## API surface

Provide an API equivalent to:

```text
POST /api/sessions
POST /api/sessions/:id/video
POST /api/sessions/:id/start
POST /api/sessions/:id/pause
POST /api/sessions/:id/seek
GET  /api/sessions/:id/state
GET  /api/sessions/:id/events
GET  /api/sessions/:id/metrics
POST /api/sessions/:id/reset
POST /api/sessions/:id/explain
```

WebSocket or server-sent events should stream state changes to the dashboard. Polling is acceptable only if the existing stack makes streaming disproportionately expensive.

## Mock fixture

Create a fixture that drives a full demo even before model integration works. It should contain:

```text
0-12s:   two children in cribs, quiet
14-20s:  one child leaves a crib
22-34s:  both outside cribs, active play, pillows moved
36-44s:  caregiver enters and returns children to cribs
46-54s:  quiet, situation resolved
56-66s:  children leave again; recurring situation opens
68-74s:  camera briefly occluded; state becomes uncertain
76-90s:  view returns; active play continues; alert fires once
92-100s: caregiver returns; both children confirmed in cribs; recurrence resolves
```

The fixture should be editable JSON and should use the same observation schema as the real provider.

## Demo mode

Add a clearly labeled demo mode that:

- uses the fixture provider;
- can run at 1x, 2x, or 4x speed;
- allows a `Simulate restart` action that reloads state from SQLite and resumes after fresh observations;
- can toggle a temporary camera occlusion;
- displays each accepted mutation as it happens;
- shows the current working-state byte count remaining roughly bounded as observation count grows.

The normal user experience should focus on the monitor. Keep raw JSON and provider diagnostics inside a collapsible developer panel.

## Acceptance criteria

The MVP is complete when all of the following work:

1. The application starts with a documented one-command development workflow.
2. Demo mode runs without external API credentials.
3. A user can upload or select an MP4 and see it play in the dashboard.
4. Structured observations appear at the correct video timestamps.
5. Repeated observations do not create duplicate timeline events or situations.
6. A child-out-of-crib situation opens, persists, alerts once, and resolves.
7. A later recurrence opens as a distinct linked situation.
8. Camera occlusion produces uncertainty without falsely resolving an event.
9. Restart simulation restores durable state and requires fresh observations before alerting.
10. The dashboard shows frames sampled versus meaningful state mutations and working-state size.
11. Invalid model output is rejected safely and visible in diagnostics.
12. Core reducer and situation-lifecycle behavior are verified with focused tests.

## Build priorities

Implement in this order:

1. Domain types, SQLite schema, reducer, and situation state machine.
2. Mock observation fixture and deterministic processing runner.
3. Dashboard with video, current state, open situations, timeline, and metrics.
4. Persistence and restart recovery.
5. Real frame extraction and visual-provider interface.
6. Liquid visual-provider integration.
7. Tinybird telemetry and optional explanation endpoint.

If time becomes constrained, preserve a complete mock-driven demo and clean provider interfaces. Do not leave the central state-machine behavior dependent on unfinished external integrations.

## Verification and handoff

Run the application and exercise the complete mock demo. Verify at minimum:

- one initial situation lifecycle;
- one recurrence;
- one uncertainty interval;
- exactly one alert per situation;
- recovery after restart;
- bounded working state despite increasing observations.

At handoff, report:

- what was implemented;
- how to run it;
- which model/provider is active;
- how to provide the demo MP4;
- which environment variables are optional or required;
- any remaining limitation that affects the live demo.
