# Nightwatch Implementation Phases

Target: a polished, complete mock-driven hackathon demo. Preserve the deterministic monitoring flow before adding external model or analytics integrations.

## Progress

- [x] Phase 1 — Application scaffold
- [x] Phase 2 — Core monitoring engine
- [x] Phase 3 — Deterministic demo runner
- [x] Phase 4 — Monitoring dashboard
- [x] Phase 5 — Persistence and restart recovery
- [x] Phase 6 — Video and frame pipeline
- [x] Phase 7 — Verification and demo hardening
- [x] Phase 8 — Nimble alert research and parent messaging
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

Status: Complete  
Original time box: 80–95 minutes

- [x] Create the full SQLite schema
- [x] Persist observations and accepted mutations
- [x] Persist canonical snapshots and situations
- [x] Persist evidence metadata and processing metrics
- [x] Reconstruct state from the append-only event log
- [x] Restore the latest snapshot as stale after restart
- [x] Require fresh confirmed observations before new alerts
- [x] Add the `Simulate restart` control

## Phase 6 — Video and frame pipeline

Status: Complete  
Original time box: 95–105 minutes

- [x] Download the configured Global News demo to `public/demo.mp4`
- [x] Verify that the frontend serves the MP4
- [x] Add local MP4 upload and object-URL playback
- [x] Select the bundled demo video when present
- [x] Synchronize sampling to video timestamps
- [x] Display the latest processed-frame position
- [x] Capture evidence thumbnails for meaningful transitions
- [x] Add the temporary camera-occlusion control

## Phase 7 — Verification and demo hardening

Status: Complete  
Original time box: 105–120 minutes

- [x] Run the complete mock demo from 0–100 seconds
- [x] Verify initial open, alert, and resolution
- [x] Verify linked recurrence
- [x] Verify uncertainty and timer pause
- [x] Verify exactly one alert per situation
- [x] Verify restart recovery
- [x] Verify bounded working state as observations increase
- [x] Check responsive layout and demo readability
- [x] Document the three-minute demo flow
- [x] Confirm clean install, type-check, tests, and production build

## Phase 8 — Nimble alert research and parent messaging

Status: Complete

- [x] Keep deterministic alert rules authoritative
- [x] Trigger nonblocking research once per concerning situation
- [x] Integrate the official Nimble Node SDK through `NIMBLE_API_KEY`
- [x] Restrict research to vetted safety domains
- [x] Create an in-app parent-message outbox
- [x] Show live research status, source links, and provider provenance
- [x] Keep parent delivery independent of research availability
- [x] Provide a clearly labeled credential-free demo fallback
- [x] Document the architecture and setup

## Stretch integrations

Status: Deferred until the complete mock demo is stable

- [ ] Implement `LiquidVisionProvider`
- [ ] Add real extracted-frame inference
- [ ] Add optional Tinybird telemetry
- [ ] Add an optional model-generated explanation endpoint

## MVP cut line

The demo is ready when it runs without credentials and demonstrates:

- [x] MP4 playback with timestamp-driven observations
- [x] Many sampled frames collapsing into a few meaningful mutations
- [x] One complete situation lifecycle and one recurrence
- [x] Occlusion producing uncertainty without resolution
- [x] Durable restart recovery
- [x] Working-state size remaining roughly bounded
- [x] Invalid provider output being rejected safely

External vision inference, Tinybird, and generated explanations remain optional.
