# Nightwatch manager

Open **http://localhost:5173/manager.html** after `npm run dev`.

The existing monitor remains at `/`. The manager is a separate light interface on the same session API. Its activity lights follow actual fixture observations and engine updates. Clicking an event shows its evidence, a rule-based decision summary and its result. These summaries are not model chain-of-thought.

## What works now

- Recorded video, playback, seeking, live session events and situation state.
- Settings → Connections: guided setup and real provider connection tests.
- RawTree: selected-database read test, loading 12 fictional household events and reading them back.
- Nimble: one public search to verify the key. This may consume account credits.
- Liquid: local endpoint/model-list check. This does **not** yet run image inference.
- Demo assets: inspect/download seed JSON, source links for footage and local video preview.

Contacts and shopping rules are visual drafts, not active automations. Sponsor connection tests do not replace the existing mock vision provider or automatically persist camera activity. The original backend still uses its existing SQLite health database and in-memory sessions; this change does not migrate the application's persistence architecture to RawTree.

## RawTree

1. In your [RawTree account](https://rawtree.com), create `family_assistant_demo`.
2. Create a `read_write` API key. Keys are cluster-wide, not database-scoped; the app explicitly passes the selected database on every data request.
3. Open Settings → Connections → RawTree. Enter the key and database; select **Connect & test**.
4. Open Settings → Demo assets, inspect the records, then select **Load sample household**.
5. Select **Read memory** to verify the write. Repeat reads after restarting/reconnecting to show persistence.

The table `family_demo_events` is created by its first insert. The seed contains fictional contacts, a stock change from six to five diapers, a reorder rule, an unfulfilled research request, an order draft and a caregiver handover. Placeholder product details are not presented as verified research. IDs are stable; repeat imports query existing IDs and insert missing records. This is a single-process convenience, not a transactional exactly-once guarantee. An uncertain write must be checked before retrying.

Reference: [API](https://rawtree.com/docs/reference/api), [authentication](https://rawtree.com/docs/reference/authentication).

## Nimble

1. Open [Nimble](https://online.nimbleway.com), then Settings → API Keys.
2. Enter the key under Settings → Connections → Nimble.
3. **Connect & test** runs a fixed public search for Nimble documentation. Household information and video frames are not included.

This verifies search access only. Product research and extraction still need to be connected to the agent's workflow. Reference: [official quickstart](https://docs.nimbleway.com/nimble-sdk/getting-started/quickstart).

## Liquid AI

1. Install llama.cpp using [Liquid's instructions](https://docs.liquid.ai/deployment/on-device/llama-cpp).
2. Obtain the [LFM2.5-VL-3B GGUF model](https://huggingface.co/LiquidAI/LFM2.5-VL-3B-GGUF) and matching vision projector. Start a local vision-capable `llama-server` on port 8080 with both files.
3. Enter `http://localhost:8080/v1` in Connections → Liquid AI and test it.

The test requires an advertised Liquid/LFM model. A reachable model endpoint does not prove that image inference works; the current camera still reads reviewed fixture observations. No large model download or installation is performed by this manager.

## Where to get footage

- [Caregiver at the crib — Pexels](https://www.pexels.com/video/people-looking-over-the-crib-for-a-baby-7918207/): a candidate for showing an adult in the scene.
- [Mother taking care of her baby — Pexels](https://www.pexels.com/video/a-mother-taking-care-of-her-baby-3875281/): a basic adult-and-child description.
- [Nursery and cradle — Pixabay](https://pixabay.com/videos/child-nursery-baby-newborn-girl-556/): a short room scene.
- The bundled footage is credited to [Global News / Corus](https://globalnews.ca/video/3321270/twin-toddlers-slumber-party-caught-on-nanny-cam), not covered by the stock-site licenses.

Sources were found from their published descriptions; each clip should be watched before assigning events. Review the [Pexels license](https://www.pexels.com/license/) or [Pixabay license](https://pixabay.com/service/license-summary/) for your use. Stock footage is good for illustrating a scene; a continuous staged recording with an adult and a doll is better for a reproducible sequence. New videos must have their own annotations or use real vision inference. Selecting a local video only previews it; it is not silently paired with the bundled clip's annotations.

## Credentials and deployment

Keys entered here live only in the API process memory and are cleared by restart or Disconnect. No browser storage, logs or API responses contain the keys. The API binds to loopback. Manager routes restrict local origins/hosts and require a custom request header. This is a localhost setup surface, not a deployable multi-user credential vault. Tests use fake responses; a real successful sponsor connection requires your credentials/local model.
