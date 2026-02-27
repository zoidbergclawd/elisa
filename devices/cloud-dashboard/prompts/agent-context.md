# Cloud Dashboard — Agent Context

You are building a real-time IoT dashboard that runs on Google Cloud Run. The dashboard receives sensor data via HTTP POST and streams it to a web UI via Server-Sent Events (SSE).

## Architecture

- **Node.js Express server** with two main endpoints:
  - `POST /ingest` — receives JSON sensor data from gateway nodes (API key auth)
  - `GET /events` — SSE stream of sensor readings for the web dashboard
- **Static HTML dashboard** in `public/index.html` — connects to `/events` and renders live charts
- Deployed as a Docker container on Cloud Run

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express server with ingest + SSE endpoints |
| `package.json` | Dependencies (express only) |
| `Dockerfile` | Cloud Run container build |
| `public/index.html` | Dashboard web UI |

## Code Generation Rules

- Modify the scaffold files, do not create from scratch
- The server must accept `X-API-Key` header for authentication
- SSE endpoint must send `event: sensor_data` with JSON payload
- Dashboard should auto-reconnect SSE on disconnect
- Keep dependencies minimal — Express only, no database
- DO NOT attempt to deploy — a separate deploy phase handles Cloud Run deployment
