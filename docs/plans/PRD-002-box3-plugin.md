**ELISA IDE**

Product Requirements Document

+-----------------------------------------------------------------------+
| PRD-002                                                               |
|                                                                       |
| **ESP32-S3-BOX-3**                                                    |
|                                                                       |
| **Voice Agent Device Plugin**                                         |
|                                                                       |
| Espressif ESP32-S3-BOX-3 · Adafruit #5835 · \$49.95                   |
+-----------------------------------------------------------------------+

  ------------------ ----------------------------------------------------
  **Status**         Draft --- Ready for Claude Code Implementation

  **Version**        1.0

  **Date**           February 2026

  **Author**         Jon / Waffle (Claude)

  **Depends On**     PRD-001: Elisa Agent Runtime, Knowledge Backpack &
                     Study Mode

  **Hardware**       Espressif ESP32-S3-BOX-3 (Adafruit #5835, \$49.95)

  **Plugin ID**      esp32-s3-box3-agent
  ------------------ ----------------------------------------------------

  ---------------- -------------------------------------------------------------
  **DEPENDENCY**   This plugin depends entirely on PRD-001 (Agent Runtime). The
                   BOX-3 is a hardware interface layer --- all agent
                   intelligence runs in the Runtime. PRD-001 must be implemented
                   or at minimum stubbed before this plugin can be end-to-end
                   tested.

  ---------------- -------------------------------------------------------------

  -----------------------------------------------------------------------
  **1. Overview**

  -----------------------------------------------------------------------

**1.1 What This Plugin Does**

This plugin enables kids to deploy their Elisa-designed agent to the
ESP32-S3-BOX-3 --- a self-contained \$50 device with a 2.4\"
touchscreen, dual digital microphones, speaker, and WiFi. The result is
a physical, always-on AI voice companion that lives on the kid\'s desk,
wakes on a spoken phrase, converses in real-time, and behaves exactly as
the kid designed it in Elisa.

The BOX-3 already ships with a ChatGPT voice demo from Espressif. This
plugin replaces that demo\'s fixed behavior with the kid\'s specific
agent --- personality, knowledge backpack, tools, study mode, and visual
identity --- without the kid touching any firmware code.

**1.2 Role in the Elisa Architecture**

The BOX-3 plugin is an interface layer, not the intelligence layer. It
handles:

-   Firmware flash --- getting the pre-built binary onto the device with
    the correct runtime connection details baked in

-   Voice I/O --- the audio capture/playback pipeline on the device that
    streams to and from the Agent Runtime

-   Touchscreen display --- rendering the agent\'s visual identity,
    state indicators, and transcription

-   Flash wizard UX --- guiding the kid through the deploy and
    verification process

Everything else --- agent intelligence, backpack retrieval, conversation
history, tool execution, TTS, STT --- lives in the Elisa Agent Runtime
(PRD-001). The BOX-3 is a smart terminal connected to that runtime.

**1.3 Value Added Over Stock BOX-3**

  ----------------------------------- -----------------------------------
  **What the BOX-3 gives you**        **What Elisa adds**

  Capable hardware: mic, speaker,     A way for a kid to build what the
  screen, WiFi                        agent does --- no code required

  Espressif ChatGPT demo (single,     The kid\'s designed personality,
  generic personality)                knowledge, tools, and study
                                      behavior

  Requires: C/ESP-IDF expertise, API  Requires: dragging blocks, clicking
  key setup, firmware build toolchain Deploy

  Static agent --- change behavior =  Dynamic agent --- change behavior =
  edit code + rebuild + reflash       update spec, instant redeploy (no
                                      reflash)

  Generic Espressif UI on the         The agent\'s visual identity,
  touchscreen                         designed by the kid in an Art Agent
                                      meeting

  No knowledge specialization         Knowledge Backpack: agent knows the
                                      kid\'s textbook, team, or subject
                                      matter
  ----------------------------------- -----------------------------------

  -----------------------------------------------------------------------
  **2. Hardware Reference**

  -----------------------------------------------------------------------

**2.1 BOX-3 Specifications**

  ---------------------- ------------------------------------------------
  **Component**          **Specification**

  SoC                    ESP32-S3 (dual-core Xtensa LX7, up to 240MHz)

  Flash / PSRAM          16MB Quad Flash + 16MB Octal PSRAM

  Display                2.4-inch SPI TFT touchscreen, 320x240 resolution

  Microphones            2x digital microphones (far-field voice
                         detection)

  Speaker                Onboard speaker with amplifier

  Connectivity           WiFi 802.11 b/g/n (2.4GHz), Bluetooth 5 LE

  Wake Word Engine       ESP-SR (offline, runs on-device --- no cloud for
                         wake word)

  USB                    Type-C --- one port on dock for data/flash, one
                         for power only

  Expansion              High-density PCIe connector for add-on modules

  Price                  \$49.95 (Adafruit #5835)

  Firmware               ESP-IDF (C-based) --- NOT MicroPython
  ---------------------- ------------------------------------------------

  --------------- -------------------------------------------------------------
  **IMPORTANT --- The BOX-3 runs ESP-IDF, not MicroPython. The existing Elisa
  NOT             flash pipeline uses mpremote to push Python files to Heltec
  MICROPYTHON**   boards. This plugin uses esptool.py to flash a pre-built
                  binary instead. The plugin must NOT attempt to use mpremote
                  with this device.

  --------------- -------------------------------------------------------------

**2.2 USB Port Distinction**

The BOX-3 dock has two USB-C ports. This is a common source of user
error. The flash wizard must explicitly call this out with a diagram:

-   Back port (data + power) --- this is the correct port for flashing

-   Front port (power only) --- plugging in here will not be detected by
    the computer

  -----------------------------------------------------------------------
  **3. Plugin Directory Structure**

  -----------------------------------------------------------------------

+-----------------------------------------------------------------------+
| devices/                                                              |
|                                                                       |
| esp32-s3-box3-agent/                                                  |
|                                                                       |
| device.json \# Required: plugin manifest                              |
|                                                                       |
| prompts/                                                              |
|                                                                       |
| agent-context.md \# Injected into builder agent system prompt         |
|                                                                       |
| firmware/                                                             |
|                                                                       |
| elisa_box3_v1.0.0.bin \# Pre-built ESP-IDF binary (or CDN URL         |
| reference)                                                            |
|                                                                       |
| elisa_box3_v1.0.0.sha256 \# Checksum for integrity verification       |
|                                                                       |
| firmware-manifest.json \# Version metadata and CDN URL                |
|                                                                       |
| templates/                                                            |
|                                                                       |
| (none --- firmware is pre-built, not generated code)                  |
|                                                                       |
| lib/                                                                  |
|                                                                       |
| (none --- no MicroPython libraries)                                   |
|                                                                       |
| scaffold/                                                             |
|                                                                       |
| (none --- runtime is platform infrastructure, not plugin-local)       |
+-----------------------------------------------------------------------+

Note: Unlike Heltec plugins, there are no template .py files. The
builder minion generates agent configuration (system prompt, greeting,
etc.) that is sent to the Agent Runtime at provisioning time, not code
that runs on the device.

  -----------------------------------------------------------------------
  **4. device.json --- Full Manifest Specification**

  -----------------------------------------------------------------------

**4.1 Top-Level Fields**

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"id\": \"esp32-s3-box3-agent\",                                      |
|                                                                       |
| \"name\": \"S3 BOX Voice Agent\",                                     |
|                                                                       |
| \"version\": \"1.0.0\",                                               |
|                                                                       |
| \"description\": \"Deploy your Elisa agent to the ESP32-S3-BOX-3 ---  |
|                                                                       |
| a physical AI companion with voice, touchscreen, and WiFi\",          |
|                                                                       |
| \"icon\": \"microphone\",                                             |
|                                                                       |
| \"colour\": 210                                                       |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

Colour 210 (blue-cyan) distinguishes this plugin from the green Heltec
family and signals the AI/voice category. Icon \"microphone\" reflects
the primary interface modality.

**4.2 Board Object**

+-----------------------------------------------------------------------+
| \"board\": {                                                          |
|                                                                       |
| \"type\": \"esp32s3\",                                                |
|                                                                       |
| \"variant\": \"espressif_s3_box3\",                                   |
|                                                                       |
| \"connection\": \"serial\",                                           |
|                                                                       |
| \"detection\": {                                                      |
|                                                                       |
| \"usb_vid\": \"0x303A\",                                              |
|                                                                       |
| \"usb_pid\": \"0x1001\"                                               |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

  ------------- -------------------------------------------------------------
  **DETECTION   The Espressif VID/PID (0x303A/0x1001) is shared across many
  NOTE**        ESP32-S3 variants. The flash wizard must confirm chip
                identity via esptool\'s chip model string (\'ESP32-S3\') AND
                verify flash size (16MB) before proceeding. The detection
                hint is a first-pass filter only.

  ------------- -------------------------------------------------------------

**4.3 Capabilities Array**

+-----------------------------------------------------------------------+
| \"capabilities\": \[                                                  |
|                                                                       |
| { \"id\": \"microphone\", \"name\": \"Dual Digital Microphones\",     |
| \"kind\": \"sensor\", \"params\": \[\] },                             |
|                                                                       |
| { \"id\": \"speaker\", \"name\": \"Onboard Speaker\", \"kind\":       |
| \"actuator\", \"params\": \[\] },                                     |
|                                                                       |
| { \"id\": \"touchscreen\", \"name\": \"2.4-inch Touchscreen           |
| (320x240)\", \"kind\": \"display\", \"params\": \[\] },               |
|                                                                       |
| {                                                                     |
|                                                                       |
| \"id\": \"wifi\", \"name\": \"WiFi (2.4GHz)\", \"kind\": \"network\", |
|                                                                       |
| \"params\": \[                                                        |
|                                                                       |
| { \"name\": \"ssid\", \"type\": \"string\", \"default\": \"\" },      |
|                                                                       |
| { \"name\": \"password\", \"type\": \"string\", \"default\": \"\" }   |
|                                                                       |
| \]                                                                    |
|                                                                       |
| },                                                                    |
|                                                                       |
| {                                                                     |
|                                                                       |
| \"id\": \"wake_word\", \"name\": \"Wake Word Engine (ESP-SR,          |
| offline)\", \"kind\": \"compute\",                                    |
|                                                                       |
| \"params\": \[{ \"name\": \"wake_word\", \"type\": \"string\",        |
| \"default\": \"hey_elisa\" }\]                                        |
|                                                                       |
| },                                                                    |
|                                                                       |
| {                                                                     |
|                                                                       |
| \"id\": \"runtime_client\", \"name\": \"Elisa Agent Runtime Client\", |
| \"kind\": \"compute\",                                                |
|                                                                       |
| \"params\": \[                                                        |
|                                                                       |
| { \"name\": \"agent_id\", \"type\": \"string\", \"default\": \"\" },  |
|                                                                       |
| { \"name\": \"api_key\", \"type\": \"string\", \"default\": \"\" },   |
|                                                                       |
| { \"name\": \"runtime_url\", \"type\": \"string\", \"default\": \"\"  |
| }                                                                     |
|                                                                       |
| \]                                                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| \]                                                                    |
+-----------------------------------------------------------------------+

The runtime_client capability is new to this plugin. It captures the
three values (agent_id, api_key, runtime_url) that must be injected into
the firmware to connect the device to the kid\'s specific agent. These
are produced automatically by the runtime provisioning step --- the kid
never sees or enters them.

**4.4 Blocks --- Block 1: Main Configuration**

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"type\": \"esp32_s3_box3_agent\",                                    |
|                                                                       |
| \"message\": \"S3 BOX Voice Agent %1 Agent Name %2 Wake Word %3 Voice |
| %4 WiFi Network %5 WiFi Password %6\",                                |
|                                                                       |
| \"args\": \[                                                          |
|                                                                       |
| { \"type\": \"input_dummy\" },                                        |
|                                                                       |
| { \"type\": \"field_input\", \"name\": \"AGENT_NAME\", \"text\": \"My |
| Agent\" },                                                            |
|                                                                       |
| { \"type\": \"field_dropdown\", \"name\": \"WAKE_WORD\", \"options\": |
| \[                                                                    |
|                                                                       |
| \[\"Hey Elisa\", \"hey_elisa\"\],                                     |
|                                                                       |
| \[\"Hey Box\", \"hey_box\"\],                                         |
|                                                                       |
| \[\"Hi Alex\", \"hi_alex\"\],                                         |
|                                                                       |
| \[\"Hey Computer\", \"hey_computer\"\]                                |
|                                                                       |
| \]},                                                                  |
|                                                                       |
| { \"type\": \"field_dropdown\", \"name\": \"TTS_VOICE\", \"options\": |
| \[                                                                    |
|                                                                       |
| \[\"Nova (friendly)\", \"nova\"\],                                    |
|                                                                       |
| \[\"Onyx (deep)\", \"onyx\"\],                                        |
|                                                                       |
| \[\"Shimmer (bright)\", \"shimmer\"\],                                |
|                                                                       |
| \[\"Echo (clear)\", \"echo\"\]                                        |
|                                                                       |
| \]},                                                                  |
|                                                                       |
| { \"type\": \"field_input\", \"name\": \"WIFI_SSID\", \"text\": \"\"  |
| },                                                                    |
|                                                                       |
| { \"type\": \"field_input\", \"name\": \"WIFI_PASSWORD\", \"text\":   |
| \"\" }                                                                |
|                                                                       |
| \],                                                                   |
|                                                                       |
| \"previousStatement\": true,                                          |
|                                                                       |
| \"nextStatement\": true,                                              |
|                                                                       |
| \"tooltip\": \"Configure your physical AI voice agent on the          |
| ESP32-S3-BOX-3\"                                                      |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

-   **Wake word dropdown:** Options must exactly match phrases supported
    by the ESP-SR offline model bundled with the firmware binary.
    Confirm against Espressif\'s current esp-sr GitHub before
    finalizing. This list may expand in future plugin versions.

-   **WiFi credentials:** Consistent with the Gateway Node block
    pattern. The UI should flag that credentials are stored in the local
    project config file on the kid\'s computer.

**4.5 Blocks --- Block 2: Display Customization (Optional)**

+-----------------------------------------------------------------------+
| {                                                                     |
|                                                                       |
| \"type\": \"esp32_s3_box3_display\",                                  |
|                                                                       |
| \"message\": \"BOX Display %1 Theme %2 Show listening indicator %3    |
| Show transcription %4\",                                              |
|                                                                       |
| \"args\": \[                                                          |
|                                                                       |
| { \"type\": \"input_dummy\" },                                        |
|                                                                       |
| { \"type\": \"field_dropdown\", \"name\": \"DISPLAY_THEME\",          |
| \"options\": \[                                                       |
|                                                                       |
| \[\"Space (dark)\", \"space\"\],                                      |
|                                                                       |
| \[\"Nature (green)\", \"nature\"\],                                   |
|                                                                       |
| \[\"Tech (blue)\", \"tech\"\],                                        |
|                                                                       |
| \[\"Candy (colorful)\", \"candy\"\],                                  |
|                                                                       |
| \[\"Plain (minimal)\", \"plain\"\]                                    |
|                                                                       |
| \]},                                                                  |
|                                                                       |
| { \"type\": \"field_checkbox\", \"name\": \"SHOW_LISTENING\",         |
| \"checked\": true },                                                  |
|                                                                       |
| { \"type\": \"field_checkbox\", \"name\": \"SHOW_TRANSCRIPTION\",     |
| \"checked\": true }                                                   |
|                                                                       |
| \],                                                                   |
|                                                                       |
| \"previousStatement\": true,                                          |
|                                                                       |
| \"nextStatement\": true,                                              |
|                                                                       |
| \"tooltip\": \"Customize what your agent looks like on the            |
| touchscreen\"                                                         |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

If this block is absent from the canvas, the deploy pipeline uses
defaults: Space theme, all indicators on. The block is optional --- a
kid can have a fully functional BOX-3 agent with only the main
configuration block.

**4.6 Deploy Object**

+-----------------------------------------------------------------------+
| \"deploy\": {                                                         |
|                                                                       |
| \"method\": \"flash\",                                                |
|                                                                       |
| \"provides\": \[\"box3_agent_endpoint\"\],                            |
|                                                                       |
| \"requires\": \[\"runtime_url\", \"agent_id\", \"api_key\"\],         |
|                                                                       |
| \"flash\": {                                                          |
|                                                                       |
| \"files\": \[\"firmware/elisa_box3_v1.0.0.bin\"\],                    |
|                                                                       |
| \"lib\": \[\],                                                        |
|                                                                       |
| \"shared_lib\": \[\],                                                 |
|                                                                       |
| \"prompt_message\": \"Plug your S3 BOX into the USB-C port on the     |
| BACK of the dock and click Ready\"                                    |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

The requires field specifies that runtime_url, agent_id, and api_key
must be available before firmware flash. These are produced by the Agent
Runtime provisioning step, which runs first in the deploy pipeline. The
deploy ordering system (deployOrder.ts) handles this sequencing
automatically.

**4.7 Spec Mapping Object**

+-----------------------------------------------------------------------+
| \"spec_mapping\": {                                                   |
|                                                                       |
| \"role\": \"voice_agent_device\",                                     |
|                                                                       |
| \"extract_fields\": {                                                 |
|                                                                       |
| \"agent.name\": \"AGENT_NAME\",                                       |
|                                                                       |
| \"agent.wake_word\": \"WAKE_WORD\",                                   |
|                                                                       |
| \"agent.voice\": \"TTS_VOICE\",                                       |
|                                                                       |
| \"wifi.ssid\": \"WIFI_SSID\",                                         |
|                                                                       |
| \"wifi.password\": \"WIFI_PASSWORD\",                                 |
|                                                                       |
| \"display.theme\": \"DISPLAY_THEME\",                                 |
|                                                                       |
| \"display.show_listening\": \"SHOW_LISTENING\",                       |
|                                                                       |
| \"display.show_transcription\": \"SHOW_TRANSCRIPTION\"                |
|                                                                       |
| }                                                                     |
|                                                                       |
| }                                                                     |
+-----------------------------------------------------------------------+

  -----------------------------------------------------------------------
  **5. Agent Context Prompt (prompts/agent-context.md)**

  -----------------------------------------------------------------------

This file is injected into the Elisa builder minion\'s system prompt
when a BOX-3 block is present. It tells the minion what to generate and
what constraints apply. The minion does NOT generate firmware code ---
it generates agent configuration for the Runtime.

+-----------------------------------------------------------------------+
| \# ESP32-S3-BOX-3 Voice Agent --- Builder Agent Context               |
|                                                                       |
| You are configuring a voice agent for the ESP32-S3-BOX-3. The device  |
| has a 2.4\"                                                           |
|                                                                       |
| touchscreen (320x240), dual digital microphones with far-field        |
| detection, a speaker,                                                 |
|                                                                       |
| WiFi, and an offline wake word engine (ESP-SR). All agent             |
| intelligence runs in the                                              |
|                                                                       |
| Elisa Agent Runtime --- you are generating configuration for that     |
| runtime, not firmware.                                                |
|                                                                       |
| \## What You Are Building                                             |
|                                                                       |
| Generate these items as structured output:                            |
|                                                                       |
| \- system_prompt: The agent\'s personality, knowledge scope, and      |
| behavior rules.                                                       |
|                                                                       |
| Passed to Claude on every conversation turn.                          |
|                                                                       |
| \- greeting: 1-2 sentences the agent speaks on first power-on.        |
|                                                                       |
| \- fallback: 1 sentence for when the agent cannot answer.             |
|                                                                       |
| \- topic_index: List of domains this agent is specialized in.         |
|                                                                       |
| \- tool_configs: Tool settings if Portal blocks are present.          |
|                                                                       |
| \## Voice Output Constraints --- CRITICAL                             |
|                                                                       |
| ALL responses will be spoken aloud through a speaker. Design          |
| accordingly:                                                          |
|                                                                       |
| \- Maximum 2-3 sentences per response. Shorter is almost always       |
| better.                                                               |
|                                                                       |
| \- NO markdown: no bullet points, no headers, no bold, no code        |
| blocks.                                                               |
|                                                                       |
| \- NO \'Here is a list of\...\' constructions. Speak naturally.       |
|                                                                       |
| \- NO responses assuming the user can see the screen --- they may be  |
| across the room.                                                      |
|                                                                       |
| \- If the answer is long, give the most important sentence first,     |
| offer to elaborate.                                                   |
|                                                                       |
| \## What NOT to Generate                                              |
|                                                                       |
| \- Do NOT generate firmware code or C code                            |
|                                                                       |
| \- Do NOT generate WiFi or network configuration                      |
|                                                                       |
| \- Do NOT generate TTS or audio processing code                       |
|                                                                       |
| \- Do NOT generate vector embedding or retrieval code                 |
|                                                                       |
| All of the above is handled by Elisa platform infrastructure.         |
+-----------------------------------------------------------------------+

  -----------------------------------------------------------------------
  **6. Deploy Pipeline --- Step by Step**

  -----------------------------------------------------------------------

When the kid hits GO on a canvas with a BOX-3 block, the deploy pipeline
executes these phases in sequence:

**Phase 1 --- Build (Existing Elisa Pipeline)**

Minions run as normal. MetaPlanner decomposes the NuggetSpec. Builder
Minion generates the agent configuration (system prompt, greeting,
fallback, topic index). Tester Minion validates it. Output is a
structured agent config JSON --- not code.

**Phase 2 --- Runtime Provisioning (New, Automatic)**

The deploy pipeline calls POST /v1/agents on the Elisa Agent Runtime:

-   Passes the compiled agent config (system prompt, tools, voice,
    display theme)

-   Receives back: agent_id, api_key, runtime_url

-   Stores these in the project config for this deploy (and for future
    redeployments)

-   On redeploy: calls PUT /v1/agents/:id instead --- no firmware
    reflash needed unless WiFi or wake word changed

**Phase 3 --- Backpack Ingestion (If Backpack Block Present)**

If the NuggetSpec includes a Backpack block with sources, the ingestion
pipeline runs for each source. Shows progress in Mission Control:
\"Adding Southeast Asian History Wikipedia article\...\" Ingestion is
asynchronous --- the flash wizard proceeds immediately after
provisioning without waiting for ingestion to complete. The backpack
will be ready before the device has its first conversation.

**Phase 4 --- Firmware Preparation**

-   Fetch the base firmware binary from the firmware/ directory or CDN
    (see Open Questions)

-   Verify checksum against the .sha256 file

-   Inject runtime connection values into the binary via the
    provisioning token approach (see Open Question #2)

-   Save patched binary to a temp file, ready for flashing

**Phase 5 --- Flash Wizard (See Section 7)**

The Flash Wizard UI takes over for the physical device step. See Section
7 for full UX spec.

**6.1 Redeploy Decision Matrix**

  --------------------------- -------------------------------------------
  **Change Type**             **Deploy Action**

  Personality, backpack,      Runtime config update only (PUT
  tools, voice, display theme /v1/agents/:id). \~5-10 seconds. No flash
                              wizard.

  WiFi SSID or password       Full firmware reflash required. Flash
  changed                     wizard runs.

  Wake word changed           Full firmware reflash required. Flash
                              wizard runs.

  Both config and firmware    Runtime update first, then flash wizard.
  changes                     
  --------------------------- -------------------------------------------

The deploy pipeline determines which case applies by diffing the new
NuggetSpec against the stored deploy config. The distinction is surfaced
clearly to the kid: \"Updated your agent ✓\" vs. \"Your agent needs to
be reflashed.\"

  -----------------------------------------------------------------------
  **7. Flash Wizard UX Specification**

  -----------------------------------------------------------------------

  ------------ -------------------------------------------------------------
  **TONE       The BOX-3 flash wizard has a different character from the
  GUIDANCE**   Heltec wizard. There is no wiring, no sensors --- the payoff
               is a conversation, not a blinking LED. Design it to feel like
               launching a product, not configuring hardware. Use the
               agent\'s name throughout.

  ------------ -------------------------------------------------------------

**7.1 Pre-Flash Screen (Phases 1--4, Automatic)**

Show four checkmarks appearing sequentially as each phase completes. Use
the agent\'s name in the copy:

+-----------------------------------------------------------------------+
| ☐ → ✓ Building Cosmo\'s personality\...                               |
|                                                                       |
| ☐ → ✓ Setting up Cosmo in the cloud\...                               |
|                                                                       |
| ☐ → ✓ Loading the knowledge backpack\...                              |
|                                                                       |
| ☐ → ✓ Preparing the firmware\...                                      |
|                                                                       |
| Cosmo is ready! Now let\'s put them on your device.                   |
+-----------------------------------------------------------------------+

**7.2 Flash Steps**

+-----+----------------------------------------------------------------+
| **  | **Connect Your S3 BOX**                                        |
| 1** |                                                                |
|     | Show a large illustration of the BOX-3 with an arrow pointing  |
|     | to the back USB-C port. Copy: \"Connect your S3 BOX using the  |
|     | cable in the BACK of the dock --- not the front one.\"         |
|     | \[Ready\] button disabled until port is detected. Show         |
|     | \"Detecting device\...\" while waiting. Verify chip model      |
|     | (ESP32-S3) and flash size (16MB) before enabling \[Ready\].    |
+-----+----------------------------------------------------------------+

+-----+----------------------------------------------------------------+
| **  | **Writing Cosmo to Your Device**                               |
| 2** |                                                                |
|     | Simple progress bar. Estimated time shown. Friendly copy:      |
|     | \"Writing Cosmo to your device\...\" Do not show esptool       |
|     | output to the kid --- log it for debugging only. Estimated     |
|     | duration: 2--3 minutes.                                        |
+-----+----------------------------------------------------------------+

+-----+----------------------------------------------------------------+
| **  | **Waking Up**                                                  |
| 3** |                                                                |
|     | \"Flash complete! Unplug and replug your S3 BOX to restart     |
|     | it.\" Then: animated pulse indicator. \"Waiting for Cosmo to   |
|     | come online\...\" Runtime polls GET /v1/agents/:id/heartbeat.  |
|     | 30-second timeout. On success: proceed to success screen. On   |
|     | timeout: show troubleshooting tips and retry option.           |
+-----+----------------------------------------------------------------+

+-----+----------------------------------------------------------------+
| **  | **Cosmo is Alive! 🎉**                                         |
| 4** |                                                                |
|     | Agent name displayed large. Wake word shown: \"Say \'Hey       |
|     | Elisa\' to meet Cosmo!\" Celebration animation. Two CTAs:      |
|     | \[Open Agent Dashboard\] and \[Done\]. Show a brief tip:       |
|     | \"Your agent will learn more the more you talk to it.\"        |
+-----+----------------------------------------------------------------+

  -----------------------------------------------------------------------
  **8. Touchscreen Display Specification**

  -----------------------------------------------------------------------

The BOX-3\'s 320x240 touchscreen displays the agent\'s visual identity
and real-time interaction state. The display is driven by the pre-built
firmware using LVGL. The Elisa plugin controls the display through theme
selection and configuration baked into the firmware at provisioning time
(Phase 2).

**8.1 Display Regions**

  ------------------ ----------------------------------------------------
  **Region**         **Content**

  Top bar (320x40px) Agent name, small avatar icon, connection status
                     indicator

  Center (320x140px) Primary display area: agent avatar/graphic (themed),
                     response text (scrolling), or idle animation

  Status band        Current state: IDLE / LISTENING / THINKING /
  (320x30px)         SPEAKING

  Bottom bar         Transcription of current user speech (if
  (320x30px)         SHOW_TRANSCRIPTION enabled)
  ------------------ ----------------------------------------------------

**8.2 Display States**

-   IDLE --- agent name and themed idle animation (subtle breathing
    effect or ambient graphics). Color palette from selected theme.

-   LISTENING --- wake word detected. Pulse animation on microphone
    icon. Amber/warm highlight. Transcription appears in bottom bar as
    speech is detected.

-   THINKING --- STT complete, waiting for runtime response. Animated
    thinking indicator (dots, spinner per theme). Keep the kid engaged.

-   SPEAKING --- TTS playing. Response text appears in center area and
    scrolls if long. Audio waveform visualization if performance allows.

**8.3 Themes**

  --------------- -------------------------------------------------------
  **Theme**       **Palette / Character**

  Space (dark)    Dark navy background, star field idle animation,
                  cyan/white text. Default.

  Nature (green)  Deep green background, leaf/plant idle graphics, warm
                  white text.

  Tech (blue)     Dark gray, circuit-board grid pattern, blue accent,
                  monospaced elements.

  Candy           Light pastel background, bouncy idle animations, bright
  (colorful)      accent colors. Good for younger kids.

  Plain (minimal) White background, clean typography, minimal graphics.
                  Maximum readability.
  --------------- -------------------------------------------------------

  -----------------------------------------------------------------------
  **9. Privacy & Safety**

  -----------------------------------------------------------------------

**9.1 COPPA --- First Deploy Consent Flow**

For user accounts flagged as under-13, the first deploy of any agent
must trigger a parent consent step before the flash wizard begins. The
parent must be authenticated (separate login or email verification).
Options presented:

-   Store session summaries only (default) --- no full transcripts
    retained

-   Store full transcripts --- accessible to parent in parent dashboard,
    not shown to kid by default

-   No history --- agent has no cross-session memory, fully stateless

These settings apply across all of the kid\'s deployed agents, not just
this one. They are stored in the runtime and enforced at the data
persistence layer.

**9.2 Content Guardrails**

The builder minion must inject these safety instructions into every
generated system prompt, regardless of the kid\'s NuggetSpec:

-   Age-appropriate content only --- redirect inappropriate topics to
    trusted adults

-   No sharing or soliciting of personal identifying information
    (address, school, phone)

-   Default to \"I\'m not sure --- ask a trusted adult\" for medical,
    legal, and safety topics

-   Never claim to be a real person, authority figure, or emergency
    service

  --------------- -------------------------------------------------------------
  **ENFORCEMENT   Guardrails are injected at the runtime level into the system
  LAYER**         prompt, not only at canvas-generation time. This prevents a
                  determined kid from removing safety instructions by modifying
                  their NuggetSpec and redeploying.

  --------------- -------------------------------------------------------------

**9.3 Credential Handling**

-   WiFi password: stored in local Elisa project config file only.
    Transmitted to esptool at flash time, never sent to Elisa servers.

-   agent_id and api_key: provisioned by the runtime. Stored in project
    config. Transmitted to device at flash time via provisioning token
    mechanism.

-   Claude API key: managed entirely server-side in the runtime. Never
    exposed to the device or the kid.

  -----------------------------------------------------------------------
  **10. Canvas Example --- Complete BOX-3 Agent**

  -----------------------------------------------------------------------

This is what a complete Southeast Asian History study agent looks like
on the Elisa canvas. Six blocks produce a fully specialized physical
voice agent.

  --------------------- -------------------------------------------------
  **Block**             **Configuration**

  **Nugget Goal**       \"A study helper for my Southeast Asian history
                        class\"

  **Feature**           \"Knows the Vietnam War, Khmer Rouge, and Spice
                        Trade era\"

  **Constraint**        \"Quiz me regularly --- don\'t just give me
                        answers\"

  **Personality**       \"Patient and encouraging, like a favorite
                        teacher\"

  **Study Mode**        Style: Quiz Me \| Difficulty: Medium \| Quiz
                        every 3 turns

  **🎒 Agent Backpack** 3 sources: SE Asia Wikipedia, Khan Academy
                        Vietnam unit, Mr. Chen\'s lecture notes (PDF)

  **S3 BOX Voice        Name: \"Sage\" \| Wake Word: Hey Elisa \| Voice:
  Agent**               Shimmer \| WiFi: \[configured\]

  **Deploy ESP32**      (no configuration required)
  --------------------- -------------------------------------------------

  ---------- -------------------------------------------------------------
  **THE      A physical device on the kid\'s desk named Sage that wakes to
  RESULT**   \"Hey Elisa\", knows their specific curriculum, quizzes them
             in their teacher\'s framework, grows its knowledge when gaps
             are discovered, and speaks in a friendly voice they chose.
             The kid built this. Without writing a line of code.

  ---------- -------------------------------------------------------------

  -----------------------------------------------------------------------
  **11. Implementation Phases**

  -----------------------------------------------------------------------

+----------+--------------------------+--------------------------------+
| *        | **Deliverables**         | **Notes**                      |
| *Phase** |                          |                                |
+----------+--------------------------+--------------------------------+
| **Phase  | -   device.json with     | Requires PRD-001 Runtime MVP   |
| 1 MVP**  |     both blocks          | to be complete or stubbed.     |
|          |                          | Produces a working end-to-end  |
|          | -   agent-context.md     | voice agent. Validates the     |
|          |     prompt               | full platform stack.           |
|          |                          |                                |
|          | -   Pre-built firmware   |                                |
|          |     binary (adapted from |                                |
|          |     Espressif ChatGPT    |                                |
|          |     demo)                |                                |
|          |                          |                                |
|          | -   Firmware             |                                |
|          |     provisioning token   |                                |
|          |     injection mechanism  |                                |
|          |                          |                                |
|          | -   Flash wizard: 4-step |                                |
|          |     flow                 |                                |
|          |                          |                                |
|          | -   Redeploy decision    |                                |
|          |     matrix (config-only  |                                |
|          |     vs. reflash)         |                                |
|          |                          |                                |
|          | -   Basic touchscreen    |                                |
|          |     display (state       |                                |
|          |     indicators only)     |                                |
|          |                          |                                |
|          | -   Space and Plain      |                                |
|          |     themes               |                                |
+----------+--------------------------+--------------------------------+
| **Phase  | -   All 5 display themes | Completes the visual identity  |
| 2        |     with LVGL            | system and production          |
| Polish** |     implementation       | readiness. Art Agent Meeting   |
|          |                          | is a Phase 2 dependency from   |
|          | -   Art Agent Meeting    | the systems thinking roadmap.  |
|          |     output → custom      |                                |
|          |     agent avatar on      |                                |
|          |     screen               |                                |
|          |                          |                                |
|          | -   Firmware CDN         |                                |
|          |     distribution (vs.    |                                |
|          |     plugin-bundled       |                                |
|          |     binary)              |                                |
|          |                          |                                |
|          | -   Multi-device support |                                |
|          |     (kid owns multiple   |                                |
|          |     BOX-3s)              |                                |
|          |                          |                                |
|          | -   Agent Management     |                                |
|          |     Page integration     |                                |
|          |                          |                                |
|          | -   Parent dashboard and |                                |
|          |     consent flow         |                                |
+----------+--------------------------+--------------------------------+
| **Phase  | -   Custom wake word     | Custom wake words require a    |
| 3        |     support (requires    | full IDF build pipeline ---    |
| Exp      |     IDF build pipeline)  | significant infrastructure.    |
| ansion** |                          | Other items are independent    |
|          | -   Portal integrations  | and can ship in any order.     |
|          |     on device (weather,  |                                |
|          |     sports, smart home)  |                                |
|          |                          |                                |
|          | -   Multi-agent on one   |                                |
|          |     device (tap screen   |                                |
|          |     to switch agents)    |                                |
|          |                          |                                |
|          | -   Hardware sensor      |                                |
|          |     integration via PCIe |                                |
|          |     add-on modules       |                                |
|          |                          |                                |
|          | -   OTA firmware updates |                                |
|          |     (update firmware     |                                |
|          |     without USB)         |                                |
+----------+--------------------------+--------------------------------+

  -----------------------------------------------------------------------
  **12. Open Questions for Development**

  -----------------------------------------------------------------------

  -------- ------------------ -------------------------------------------------
  **\#**   **Question**       **Recommendation / Context**

  **1**    **Firmware binary  Bundle with plugin (adds \~4MB to repo) vs.
           distribution**     download from Elisa CDN at flash time. CDN
                              preferred: download once, cache locally, serve
                              hash-verified. Requires internet at first flash
                              --- acceptable for target audience.

  **2**    **Firmware         RECOMMENDED: First-boot provisioning token. At
           provisioning       flash time, inject only a short-lived token. On
           mechanism**        first WiFi connect, device fetches its full
                              config (agent_id, api_key, runtime_url, wake word
                              config) from the runtime using the token. Cleaner
                              than binary patching, enables future OTA config
                              updates without reflash.

  **3**    **Wake word phrase Must verify the exact supported phrases in the
           confirmation**     ESP-SR model bundled with the firmware before
                              finalizing the dropdown options. Check
                              Espressif\'s esp-sr GitHub repository for the
                              current HIFi4 model\'s supported wake words.

  **4**    **LVGL theme       The firmware\'s LVGL UI must support the 5
           implementation**   defined themes. Phase 1 can ship with Space and
                              Plain only. Remaining themes can be added in
                              Phase 2 via firmware update.

  **5**    **BOX-3            The BOX-3 is listed as out of stock on Adafruit
           availability**     as of this writing. Confirm supply availability
                              before prioritizing this plugin over other deploy
                              targets. The architecture is valid regardless ---
                              alternative ESP32-S3 devices with screens could
                              use a simplified version of this plugin.
  -------- ------------------ -------------------------------------------------

--- END OF PRD-002 ---
