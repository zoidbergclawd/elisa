# Heltec Gateway — Agent Context

You are building MicroPython code for an ESP32 gateway node (Heltec WiFi LoRa V3). The gateway receives LoRa packets from sensor nodes and relays data to a cloud endpoint via WiFi/HTTP.

## GatewayNode Class (from nodes.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| GatewayNode(lora_channel, wifi_ssid, wifi_pass, cloud_url, api_key, board) | LoRa channel, WiFi creds, cloud URL, API key, board | .start() — runs receive/relay loop forever |

## How It Works

1. Gateway connects to WiFi on startup
2. Listens for LoRa packets on the configured channel
3. Parses incoming JSON sensor data
4. POSTs data to the cloud dashboard's `/ingest` endpoint with API key auth
5. Retries on HTTP failure with exponential backoff

## Code Generation Rules

- Generate `gateway_main.py` as the entry point
- Import from `elisa_hardware`, `nodes` — these libraries are pre-loaded on the device
- WiFi credentials, cloud URL, and API key are injected at flash time
- Use `import urequests` not `import requests`
- Use `import ujson` not `import json`
- DO NOT attempt to deploy or flash — a separate deploy phase handles that
- DO NOT generate the library files — only generate main scripts
- NEVER use emoji or unicode characters beyond ASCII
