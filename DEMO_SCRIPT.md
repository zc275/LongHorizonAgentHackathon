# NurserAI Three-Minute Demo

## Before presenting

1. Run `npm install` and `npm run dev`.
2. Open <http://localhost:5173>.
3. Confirm the header says **Pipeline online** and the source says **Bundled demo**.
4. Keep Developer diagnostics collapsed until the restart portion.

## 0:00–0:30 — State the idea

Explain that NurserAI does not keep every frame in its working context. It samples the video, validates visible facts, confirms changes across observations, and maintains a small mutable room state. The complete observation and mutation history remains available for audit.

Point out the four main areas: video, canonical room state, open situations, and the event journal with compression metrics.

## 0:30–1:25 — Run the first episode

1. Select **4×** playback and press Play.
2. At video time 16 seconds, show the confirmed child-out-of-crib situation.
3. Around 24 seconds, point out active play and moved pillows.
4. At 26 seconds, show the one-time red alert.
5. In **Parent notifications**, show that the alert starts Nimble research and produces a parent-facing message with vetted source links. The badge reads **NIMBLE LIVE** when `NIMBLE_API_KEY` is configured.
6. Around 44 seconds, show that confirmed return to the cribs resolves the situation.

Emphasize that repeated frames increase the discarded count without adding prose to working context.

## 1:25–2:05 — Show recurrence and uncertainty

1. Continue playback through 58 seconds.
2. Show the new situation and its **Recurrence** label.
3. At 68 seconds, the fixture occludes the camera. Point out that the state becomes uncertain and the situation does not resolve.
4. When the view returns, show that two usable observations are required before monitoring becomes fresh again.
5. Point out that uncertainty time is excluded from the alert timer.

The **Occlude** button can trigger the same behavior manually on the next sampled frame.

## 2:05–2:35 — Demonstrate durable recovery

1. Reset, seek to roughly 24 seconds, and wait for the state to populate.
2. Expand **Developer diagnostics** and select **Simulate restart**.
3. Show that the state is restored from SQLite but marked uncertain.
4. Resume playback. The first fresh sample remains provisional; the second restores confidence.

Explain that the application will not emit a new alert from stale state immediately after a process restart.

## 2:35–3:00 — Close on context efficiency

Seek to 100 seconds or let the demo finish. Highlight:

- 51 sampled frames and observations;
- more than 30 discarded repeated observations;
- two linked child-out-of-crib episodes;
- exactly one alert per episode;
- a serialized working state under 4 KB.

Mention that **Choose MP4** accepts a local video while the mock provider continues to supply deterministic timestamp-based observations. External vision inference can replace the mock through the provider interface.

The alert decision comes from the deterministic temporal rule. Nimble enriches the message asynchronously, so research latency cannot delay the instruction to check the nursery.

## Fallback

If browser playback is interrupted, use the seek bar to jump directly to 24, 70, or 100 seconds. Seeking deterministically rebuilds the same state and event history.
