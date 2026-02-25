// Elisa IoT Cloud Dashboard Server
// Receives sensor data from ESP32 gateway via HTTP POST,
// streams live updates to browsers via Server-Sent Events (SSE).

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY || "";

// --- In-memory storage (last 100 readings) ---
const MAX_READINGS = 100;
const readings = [];

// --- SSE client management ---
const sseClients = new Set();

app.use(express.json());

// --- POST /data - ESP32 gateway sends sensor readings ---
app.post("/data", (req, res) => {
  // Validate API key
  if (!API_KEY) {
    console.warn("WARNING: API_KEY env var not set - rejecting all POST /data requests");
    return res.status(500).json({ error: "Server API_KEY not configured" });
  }

  const clientKey = req.get("X-API-Key");
  if (clientKey !== API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  const data = req.body;
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Request body must be JSON" });
  }

  // Add server-side timestamp
  const reading = {
    ...data,
    receivedAt: new Date().toISOString(),
  };

  // Store reading (cap at MAX_READINGS)
  readings.push(reading);
  if (readings.length > MAX_READINGS) {
    readings.splice(0, readings.length - MAX_READINGS);
  }

  // Broadcast to all SSE clients
  const message = `data: ${JSON.stringify(reading)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }

  console.log(`Received reading from ${data.nodeId || "unknown"} - ${sseClients.size} SSE client(s)`);
  res.status(200).json({ status: "ok", stored: readings.length });
});

// --- GET /events - SSE endpoint for browser ---
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering if proxied
  });

  // Send any existing readings as initial burst
  if (readings.length > 0) {
    const last10 = readings.slice(-10);
    for (const reading of last10) {
      res.write(`data: ${JSON.stringify(reading)}\n\n`);
    }
  }

  // Register client
  sseClients.add(res);
  console.log(`SSE client connected (${sseClients.size} total)`);

  // Keepalive every 30 seconds
  const keepalive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 30000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(keepalive);
    sseClients.delete(res);
    console.log(`SSE client disconnected (${sseClients.size} remaining)`);
  });
});

// --- GET / - Serve static files from public/ ---
app.use(express.static(path.join(__dirname, "public")));

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Elisa IoT Dashboard running on port ${PORT}`);
  if (!API_KEY) {
    console.warn("WARNING: API_KEY env var not set - POST /data will reject all requests");
  }
});
