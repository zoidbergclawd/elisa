# Portals

Portals connect your Elisa project to external tools, services, and hardware. They let your AI agents interact with the outside world.

## Mechanism Types

Each portal uses one of four mechanisms:

| Mechanism | What It Is | Example |
|-----------|-----------|---------|
| **MCP Server** | A Model Context Protocol server that provides tools | File System, GitHub, Brave Search |
| **CLI Tool** | A command-line program the agent can run | gcloud, curl, python3 |
| **Serial / USB** | A hardware device connected via USB serial | ESP32 board, LoRa radio |
| **Auto-detect** | Elisa figures out the best mechanism automatically | General-purpose fallback |

## Creating a Portal

1. Click the **Portals** button in the sidebar.
2. Click **+ New Portal** to create from scratch, or **From Template** to start with a pre-configured one.
3. Fill in the fields:
   - **Name** — A label for this portal (e.g., "My ESP32 Board")
   - **Description** — What it connects to
   - **Mechanism** — Which type of connection to use
4. Configure mechanism-specific settings (see below).
5. Click **Done**.

### Serial / USB Settings

- **Serial Port** — The port name (e.g., `COM3` on Windows, `/dev/ttyUSB0` on Linux). Leave blank for auto-detection.
- **Baud Rate** — Communication speed (default: 115200).

If a board is currently connected, a green banner shows the detected board and port.

### MCP Server Settings

- **Command** — The program to run (e.g., `npx`).
- **Arguments** — Command-line arguments (e.g., `-y @anthropic-ai/mcp-filesystem`).

### CLI Tool Settings

- **Command** — The program to run (e.g., `gcloud`).

## Portal Templates

Click **From Template** to browse pre-configured portals:

| Template | Mechanism | Capabilities |
|----------|-----------|-------------|
| **ESP32 Board** | Serial | LED on/off/blink, Read sensor, Button pressed, Play sound |
| **LoRa Radio** | Serial | Send message, Message received |
| **File System** | MCP | Read file, Write file, List files |
| **GitHub** | MCP | Create issue, Read repo, Search code |
| **Brave Search** | MCP | Web search, Local search |
| **Cloud Run Deploy** | CLI | Deploy to Cloud Run |

Selecting a template pre-fills the name, mechanism, configuration, and capabilities.

## Capability Types

Each portal has capabilities that define what it can do:

| Kind | What It Does | Portal Block |
|------|-------------|-------------|
| **Tell** (action) | Sends a command to the portal | "Tell ___ to ___" |
| **When** (event) | Reacts when something happens | "When ___ ___" |
| **Ask** (query) | Requests data from the portal | "Ask ___ for ___" |

## Dynamic Parameters

Some capabilities have parameters that appear as additional fields on the block when you select that capability. Parameter types include text, number, boolean (checkbox), and choice (dropdown).

## Using Portals in Your Design

After creating a portal, drag Portal blocks (Tell, When, or Ask) onto your canvas from the Portals category in the toolbox. The first dropdown selects which portal to use, and the second selects which capability.

## Security

CLI portals validate commands against a strict allowlist before execution:

```
node, npx, python, python3, pip, pip3, mpremote, arduino-cli, esptool, git
```

Any command not in this list is rejected. Commands are executed via `execFile` (not shell), preventing shell injection.

> **Try it**: Click Portals in the sidebar, then "From Template", and select "File System". Save it, then drag a "Tell" block onto the canvas. Select "File System" and "Write file" from the dropdowns. Now your agents can write files to disk during the build.
