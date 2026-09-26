# NurserAI Monitor

A compact, stateful activity journal for long-running nursery video. The application is a hackathon demonstration and is not a certified safety or medical device.

Implementation progress is tracked in [IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md).
The presentation flow is documented in [DEMO_SCRIPT.md](./DEMO_SCRIPT.md).

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on <http://localhost:3001> and stores local data in `data/nightwatch.sqlite`.

The light one-page manager is at <http://localhost:5173/manager.html>. Its Settings tab includes sponsor connection tests, a synthetic RawTree household dataset and video sources. See [Manager setup](./MANAGER_SETUP.md) for the supported behavior and remaining integration work.

## Demo video

The configured local demo is available at `public/demo.mp4`. It was downloaded from the direct media URL exposed by the [Global News reference page](https://globalnews.ca/video/3321270/twin-toddlers-slumber-party-caught-on-nanny-cam). The source clip is credited to Global News/Corus and should be used according to the publisher's terms.

To use a different clip, replace that file or select a local MP4 through the dashboard once the video controls are enabled.

Optional configuration:

- `PORT`: API port, defaults to `3001`.
- `DATABASE_PATH`: SQLite file location, defaults to `data/nightwatch.sqlite`.
- `NIMBLE_API_KEY` (or `NIMBLE_API`): enables live, source-linked safety research when a confirmed alert fires. The key is only read by the API and `.env` is ignored by Git.
- `TINYBIRD_TOKEN` (or the existing `TINY_BIRD_API`): sends observation and accepted-mutation telemetry to Tinybird asynchronously. The data source must first be deployed; see [TINYBIRD_INTEGRATION.md](./TINYBIRD_INTEGRATION.md). Set `TINYBIRD_API_URL` for a non-default workspace region if needed.

The Nimble flow and its safety boundaries are documented in [NIMBLE_INTEGRATION.md](./NIMBLE_INTEGRATION.md).

## Demo API

Create a mock session with `POST /api/sessions`, then control it with:

- `POST /api/sessions/:id/start` with an optional JSON body such as `{ "speed": 4 }`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/seek` with `{ "seconds": 56 }`
- `POST /api/sessions/:id/reset`
- `POST /api/sessions/:id/restart` to rebuild working state from SQLite
- `POST /api/sessions/:id/occlusion` with `{ "enabled": true }` for the demo override
- `GET /api/sessions/:id/state`
- `GET /api/sessions/:id/events`
- `GET /api/sessions/:id/metrics`
- `GET /api/sessions/:id/notifications`
- `GET /api/sessions/:id/stream` for server-sent updates

## Other commands

```bash
npm run typecheck
npm run build
npm test
npm run verify:demo
```

### Unified manager

Open `http://localhost:5173/` (or `/manager.html`) for the integrated light manager. The original technical monitor is at `/monitor.html`. The manager includes backend alert research, expandable room context, session recovery checks, and **Camera → Connect phone**. See [MANAGER_SETUP.md](MANAGER_SETUP.md) for pairing requirements and limitations.
