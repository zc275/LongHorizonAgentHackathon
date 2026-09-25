# Nightwatch Implementation Phases

Target: a polished, complete mock-driven hackathon demo. Preserve the deterministic monitoring flow before adding external model or analytics integrations.

## Progress

- [x] Phase 1 — Application scaffold
- [x] Phase 2 — Core monitoring engine
- [x] Phase 3 — Deterministic demo runner
- [x] Phase 4 — Monitoring dashboard
- [ ] Phase 5 — Persistence and restart recovery
- [ ] Phase 6 — Video and frame pipeline
- [ ] Phase 7 — Verification and demo hardening
- [ ] Stretch — External integrations

## Phase 1 — Application scaffold

Status: Complete  
Original time box: 0–10 minutes

- [x] React and TypeScript frontend
- [x] Node and Express API
- [x] SQLite connection
- [x] Shared domain types
- [x] One-command development workflow with `npm run dev`
- [x] Responsive monitoring-console shell
- [x] Production build and type-check configuration

## Phase 2 — Core monitoring engine

Status: Complete  
Original time box: 10–35 minutes

- [x] Strict candidate-observation validation
- [x] Two-observation temporal confirmation
- [x] Canonical room state separated from observations
- [x] Explicit typed state mutations
- [x] Child-out-of-crib lifecycle
- [x] Active-play and room-disruption rules
- [x] One alert per situation using video time
- [x] Confirmed resolution and linked recurrence
- [x] Camera uncertainty without false resolution
- [x] Alert timer pause during uncertainty
- [x] Repeated-observation suppression
- [x] Bounded working-state measurement
- [x] Focused unit tests

## Phase 3 — Deterministic demo runner

Status: Complete  
Original time box: 35–50 minutes

- [x] Create the editable 0–100 second JSON observation fixture
- [x] Add the `VisualObservationProvider` interface
- [x] Implement `MockVisionProvider`
- [x] Implement a two-second video-time sampler
- [x] Keep at most one observation request in flight
- [x] Skip to the newest eligible frame if processing falls behind
- [x] Feed observations into the monitoring engine
- [x] Expose session state, mutations, events, and metrics through the API
- [x] Stream updates with server-sent events

## Phase 4 — Monitoring dashboard

Status: Complete  
Original time box: 50–80 minutes

- [x] Video panel with play, pause, seek, and speed controls
- [x] Current-room-state cards
- [x] Live unresolved-situation cards and durations
- [x] Obvious one-time alert state
- [x] Chronological mutation timeline
- [x] Evidence thumbnails
- [x] Frames-versus-mutations context metrics
- [x] Observation freshness and uncertainty treatment
- [x] Collapsible developer diagnostics

## Phase 5 — Persistence and restart recovery

Status: Not started  
Original time box: 80–95 minutes

- [ ] Create the full SQLite schema
- [ ] Persist observations and accepted mutations
- [ ] Persist canonical snapshots and situations
- [ ] Persist evidence metadata and processing metrics
- [ ] Reconstruct state from the append-only event log
- [ ] Restore the latest snapshot as stale after restart
- [ ] Require fresh confirmed observations before new alerts
- [ ] Add the `Simulate restart` control

## Phase 6 — Video and frame pipeline

Status: In progress  
Original time box: 95–105 minutes

- [x] Download the configured Global News demo to `public/demo.mp4`
- [x] Verify that the frontend serves the MP4
- [ ] Add local MP4 upload and object-URL playback
- [ ] Select the bundled demo video when present
- [ ] Synchronize sampling to video timestamps
- [ ] Display the latest processed-frame position
- [ ] Capture evidence thumbnails for meaningful transitions
- [ ] Add the temporary camera-occlusion control

## Phase 7 — Verification and demo hardening

Status: Not started  
Original time box: 105–120 minutes

- [ ] Run the complete mock demo from 0–100 seconds
- [ ] Verify initial open, alert, and resolution
- [ ] Verify linked recurrence
- [ ] Verify uncertainty and timer pause
- [ ] Verify exactly one alert per situation
- [ ] Verify restart recovery
- [ ] Verify bounded working state as observations increase
- [ ] Check responsive layout and demo readability
- [ ] Document the three-minute demo flow
- [ ] Confirm clean install, type-check, tests, and production build

## Stretch integrations

Status: Deferred until the complete mock demo is stable

- [ ] Implement `LiquidVisionProvider`
- [ ] Add real extracted-frame inference
- [ ] Add optional Tinybird telemetry
- [ ] Add an optional model-generated explanation endpoint

## MVP cut line

The demo is ready when it runs without credentials and demonstrates:

- [ ] MP4 playback with timestamp-driven observations
- [ ] Many sampled frames collapsing into a few meaningful mutations
- [ ] One complete situation lifecycle and one recurrence
- [ ] Occlusion producing uncertainty without resolution
- [ ] Durable restart recovery
- [ ] Working-state size remaining roughly bounded
- [ ] Invalid provider output being rejected safely

External vision inference, Tinybird, and generated explanations remain optional.
