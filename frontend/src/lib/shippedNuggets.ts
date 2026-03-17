/**
 * PRD-003 Phase 2: Shipped Nuggets.
 * Pre-built specifications for common patterns, using the same builtin
 * packaging as shipped Skills.
 */

import type { NuggetSpec } from '../components/BlockCanvas/blockInterpreter';

export interface ShippedNugget {
  id: string;
  name: string;
  description: string;
  spec: NuggetSpec;
}

export const SHIPPED_NUGGETS: ShippedNugget[] = [
  {
    id: 'shipped-web-dashboard',
    name: 'Web Dashboard',
    description: 'A data visualization dashboard with live-updating cards and charts.',
    spec: {
      nugget: {
        goal: 'A data visualization dashboard with live-updating cards and charts',
        description: 'A data visualization dashboard with live-updating cards and charts',
        type: 'website',
      },
      requirements: [
        { type: 'feature', description: 'a responsive card grid showing key metrics' },
        { type: 'feature', description: 'a line chart that updates when new data arrives' },
        { type: 'feature', description: 'a data ingest endpoint that accepts JSON POST requests' },
        { type: 'when_then', description: 'When new data is posted, the dashboard updates within 2 seconds' },
      ],
      agents: [],
      deployment: { target: 'web', auto_flash: false },
      workflow: {
        review_enabled: false,
        testing_enabled: true,
        human_gates: [],
        behavioral_tests: [
          { id: 'test_0', when: 'data is posted to the ingest endpoint', then: 'the dashboard cards update with the new values', requirement_id: 'req_3' },
        ],
      },
      skills: [
        { id: 'shipped-skill-dashboard-ux', name: 'Dashboard UX', prompt: 'Use SSE (Server-Sent Events) for real-time updates. Show a card per metric with the latest value and a sparkline. Use color-coded status indicators (green = normal, yellow = warning, red = alert).', category: 'feature' },
      ],
    },
  },
  {
    id: 'shipped-rest-api',
    name: 'REST API Server',
    description: 'A basic REST API backend with CRUD endpoints and JSON responses.',
    spec: {
      nugget: {
        goal: 'A REST API server with CRUD endpoints for managing items',
        description: 'A REST API server with CRUD endpoints for managing items',
        type: 'tool',
      },
      requirements: [
        { type: 'feature', description: 'GET /items returns a JSON array of all items' },
        { type: 'feature', description: 'POST /items creates a new item and returns it' },
        { type: 'feature', description: 'PUT /items/:id updates an existing item' },
        { type: 'feature', description: 'DELETE /items/:id removes an item' },
        { type: 'constraint', description: 'All responses must be JSON with proper HTTP status codes' },
      ],
      agents: [],
      deployment: { target: 'web', auto_flash: false },
      workflow: {
        review_enabled: false,
        testing_enabled: true,
        human_gates: [],
        behavioral_tests: [
          { id: 'test_0', when: 'a POST request is sent with valid JSON', then: 'a new item is created and returned with a 201 status', requirement_id: 'req_1' },
          { id: 'test_1', when: 'a GET request is sent to /items', then: 'all items are returned as a JSON array', requirement_id: 'req_0' },
        ],
      },
    },
  },
  {
    id: 'shipped-sensor-node',
    name: 'Sensor Node',
    description: 'An ESP32-based sensor data collector that reads sensors and transmits data.',
    spec: {
      nugget: {
        goal: 'A sensor node that reads DHT22 temperature/humidity and transmits data periodically',
        description: 'A sensor node that reads DHT22 temperature/humidity and transmits data periodically',
        type: 'hardware',
      },
      requirements: [
        { type: 'feature', description: 'reads DHT22 sensor for temperature and humidity every 10 seconds' },
        { type: 'feature', description: 'displays current readings on the OLED screen' },
        { type: 'feature', description: 'transmits sensor data as JSON via serial output' },
        { type: 'constraint', description: 'handles sensor read failures gracefully without crashing' },
      ],
      agents: [],
      deployment: { target: 'esp32', auto_flash: true },
      workflow: {
        review_enabled: false,
        testing_enabled: true,
        human_gates: [],
      },
      skills: [
        { id: 'shipped-skill-robust-iot', name: 'Robust IoT code', prompt: 'All MicroPython code must handle sensor read failures gracefully: catch exceptions per-sensor, log the error, and continue the loop with partial data.', category: 'agent' },
      ],
    },
  },
];
