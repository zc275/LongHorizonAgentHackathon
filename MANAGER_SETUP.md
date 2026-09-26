# NurserAI manager

Open **http://localhost:5173/manager.html** after `npm run dev`.

The manager is the default page at `/`; the technical monitor remains at `/monitor.html`. The manager is a separate light interface on the same session API. Its activity lights follow actual fixture observations and engine updates. Clicking an event shows its evidence, a rule-based decision summary and its result. These summaries are not model chain-of-thought.

## What works now

- A continuous camera-style preview: sample footage starts automatically, repeats, and updates session events and situation state. The manager has no playback controls; the technical monitor at `/monitor.html` retains them. Each sample replay starts a fresh fixture cycle.
- Settings → Connections: guided setup and real provider connection tests.
- Instacart appears in the connection list as an unconnected shopping service. Its **Preview request** action returns to Overview, highlights the connection, and shows a clearly labeled local activity preview. No Instacart API call or purchase is made.
- RawTree: selected-database read test, loading 12 fictional household events and reading them back.
- Nimble: one public search verifies the key. A tested key also enables safety-resource lookups for confirmed sample-session alerts. Requests may consume account credits. Research results appear as expandable in-app alerts.
- Liquid: local endpoint check and live phone-frame descriptions through the configured multimodal model. No sound or crying detection is inferred from still images.
- Demo assets: inspect/download seed JSON, source links for footage and local video preview.

Contacts and shopping rules remain visual drafts. The pulled backend persists sample-session observations, events and state in SQLite and supports simulated restart recovery. RawTree remains a separate seeded household dataset. Phone footage does not run through the mock observations or trigger these alerts.

## RawTree

1. In your [RawTree account](https://rawtree.com), select a database you can access. Use `family_assistant_demo` if an admin created it; otherwise `default` works with the supplied demo key.
2. Create a `read_write` API key. Keys are cluster-wide, not database-scoped; the app explicitly passes the selected database on every data request.
3. Open Settings → Connections → RawTree. Enter the key and database; select **Connect & test**.
4. Open Settings → Demo assets, inspect the records, then select **Load sample household**.
5. Select **Read memory** to verify the write. Repeat reads after restarting/reconnecting to show persistence.

The table `family_demo_events` is created by its first insert in the selected database. The seed contains fictional contacts, a stock change from six to five diapers, a reorder rule, an unfulfilled research request, an order draft and a caregiver handover. Placeholder product details are not presented as verified research. IDs are stable; repeat imports query existing IDs and insert missing records. This is a single-process convenience, not a transactional exactly-once guarantee. An uncertain write must be checked before retrying.

Reference: [API](https://rawtree.com/docs/reference/api), [authentication](https://rawtree.com/docs/reference/authentication).

## Nimble

1. Open [Nimble](https://online.nimbleway.com), then Settings → API Keys.
2. Enter the key under Settings → Connections → Nimble.
3. **Connect & test** runs a fixed public search for Nimble documentation. Household information and video frames are not included.

A successful Settings test supplies the key to the running alert enrichment workflow. Disconnecting reverts to the server environment key, if configured, or saved demo sources. Product research and ordering remain separate future integrations. Reference: [official quickstart](https://docs.nimbleway.com/nimble-sdk/getting-started/quickstart).

## Liquid AI

1. Install llama.cpp using [Liquid's instructions](https://docs.liquid.ai/deployment/on-device/llama-cpp).
2. Obtain the [LFM2.5-VL-3B GGUF model](https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF) and matching vision projector. Start a local vision-capable `llama-server` on port 8080 with both files.
3. Enter `http://localhost:8080/v1` in Connections → Liquid AI and test it.

The test requires an advertised Liquid/LFM model. When a phone camera is connected, the manager sends a fresh frame to the local multimodal chat endpoint about every 12 seconds and displays the returned visual description. Sample footage still uses its reviewed fixture observations. No large model download or installation is performed by this manager.

## Where to get footage

- [Caregiver at the crib — Pexels](https://www.pexels.com/video/people-looking-over-the-crib-for-a-baby-7918207/): a candidate for showing an adult in the scene.
- [Mother taking care of her baby — Pexels](https://www.pexels.com/video/a-mother-taking-care-of-her-baby-3875281/): a basic adult-and-child description.
- [Nursery and cradle — Pixabay](https://pixabay.com/videos/child-nursery-baby-newborn-girl-556/): a short room scene.
- The bundled footage is credited to [Global News / Corus](https://globalnews.ca/video/3321270/twin-toddlers-slumber-party-caught-on-nanny-cam), not covered by the stock-site licenses.

Sources were found from their published descriptions; each clip should be watched before assigning events. Review the [Pexels license](https://www.pexels.com/license/) or [Pixabay license](https://pixabay.com/service/license-summary/) for your use. Stock footage is good for illustrating a scene; a continuous staged recording with an adult and a doll is better for a reproducible sequence. New videos must have their own annotations or use real vision inference. Selecting a local video only previews it; it is not silently paired with the bundled clip's annotations.

## Credentials and deployment

Keys entered here live only in the API process memory and are cleared by restart or Disconnect. No browser storage, logs or API responses contain the keys. The API binds to loopback. Manager routes restrict local origins/hosts and require a custom request header. This is a localhost setup surface, not a deployable multi-user credential vault. Tests use fake responses; a real successful sponsor connection requires your credentials/local model.

## Phone camera

1. Open **Camera → Connect phone** in the left sidebar.
2. Scan the QR code, tap **Start camera**, and grant camera access on your phone.
3. Keep the phone browser visible. Return to Overview on the computer to see the live view.
4. Use **Stop camera** on the phone or **Disconnect** in Settings to revoke the session. **Use sample footage** restores the annotated demo.

Requires a built phone page (`npm run build`) and `cloudflared` on PATH, or a configured HTTPS `CAMERA_PUBLIC_ORIGIN` pointing to the dedicated gateway on port 3002. A quick tunnel starts on demand for local testing. Only the camera gateway is exposed; manager and database routes stay local. Camera frames transit Cloudflare; this is an HTTPS relay, not end-to-end WebRTC encryption.

The phone sends sequential JPEG frames at up to roughly 4 fps; slow networks reduce the rate. The microphone is disabled. A separate Enable sound button on the phone unlocks the speaker for manager-initiated comfort actions. Only the latest frame is retained in RAM, with stale frames withheld after 5 seconds and discarded after 10 seconds. A 10-minute, single-use QR secret issues separate upload and viewing capabilities. Sessions last at most 8 hours and can be revoked by either device. Refreshing either page requires pairing again. No recording is implemented. Liquid AI describes selected phone frames when connected, but still images cannot verify crying or other sounds. This is a development pairing flow, not a production camera service.

## Integrated backend demo

Confirmed sample alerts appear in Activity with expandable messages and source links. The Nimble connection highlights during live research; saved sources are labeled separately. **Room context** reveals current confirmed state without adding a permanent dashboard panel. **Settings → Demo assets → Session checks** exposes blocked-view and saved-state recovery controls. The manager resumes sample playback after restoring state so fresh observations can reconfirm it. These notifications are in-app only.

## Comfort tools and camera test

On Overview, open **Comfort tools** in Activity and choose **Play lullaby**, **Talk to baby**, or **Stop**. These are manually triggered demo actions. With a paired phone, tap **Enable sound for comfort tools** on the phone first; sound then plays there. Without a paired phone, the current computer plays the generated lullaby or short spoken phrase. No microphone capture, crying classifier, automatic trigger, or prerecorded copyrighted music is included.

Open **Settings → Demo assets → Test your phone camera → Open camera test screen**, or go directly to `/test-screen.html`. Click **Play full screen**, aim the phone’s rear camera at the computer screen, and watch the feed and optional Liquid description in Overview. The bundled footage loops and is still attributed to Global News / Jonathan Balkin. The phone page must remain visible.
