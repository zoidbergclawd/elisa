**ELISA IDE**

Product Requirements Document

+-----------------------------------------------------------------------+
| PRD-001                                                               |
|                                                                       |
| **Elisa Agent Runtime,**                                              |
|                                                                       |
| **Knowledge Backpack &**                                              |
|                                                                       |
| **Study Mode**                                                        |
+-----------------------------------------------------------------------+

  ------------------ ----------------------------------------------------
  **Status**         Draft --- Ready for Claude Code Implementation

  **Version**        1.0

  **Date**           February 2026

  **Author**         Jon / Waffle (Claude)

  **Depends On**     Existing Elisa canvas, NuggetSpec pipeline, Blockly
                     block system

  **Enables**        PRD-002: ESP32-S3-BOX-3 Device Plugin, all future
                     deploy targets
  ------------------ ----------------------------------------------------

  ----------- -------------------------------------------------------------
  **⚡ KEY    This PRD defines platform infrastructure --- not a single
  INSIGHT**   feature. The Agent Runtime, Knowledge Backpack, and Study
              Mode are shared services that every Elisa deploy target
              (BOX-3, Telegram, Web Link, Scheduled Agents) will consume.
              Build these right once and all future deploy targets inherit
              their capabilities.

  ----------- -------------------------------------------------------------

  -----------------------------------------------------------------------
  **1. Overview & Strategic Context**

  -----------------------------------------------------------------------

**1.1 What We Are Building**

Elisa currently gives kids a visual block editor to design AI agents.
But a designed agent is not yet a running agent --- there is no platform
infrastructure that takes a NuggetSpec and turns it into something a kid
can actually talk to or interact with. This PRD fills that gap.

Three platform services are specified here:

-   **Elisa Agent Runtime** --- A persistent cloud service that compiles
    a kid\'s NuggetSpec into a live, running agent. Every deployed
    agent, regardless of target device or interface, connects to this
    runtime.

-   **Knowledge Backpack** --- A RAG (Retrieval Augmented Generation)
    system that gives agents access to specialized knowledge beyond
    Claude\'s base training. Exposed to kids through a familiar
    \"backpack\" metaphor --- fill it with materials your agent can look
    things up in.

-   **Study Mode** --- A behavioral layer that turns any agent into a
    quiz-capable tutor. Uses backpack content to generate questions,
    track performance, and apply spaced repetition logic.

**1.2 Architecture Position**

These three services sit between the Elisa canvas and all deploy
targets. The canvas produces a NuggetSpec. The runtime consumes it.
Deploy targets (BOX-3, Telegram, Web Link, etc.) are interface layers
that connect to the runtime --- they are not responsible for agent
intelligence.

+-----------------------------------------------------------------------+
| **ELISA CANVAS → NuggetSpec → AGENT RUNTIME → Deploy Targets**        |
|                                                                       |
| Runtime subsystems: Identity Store \| Knowledge Backpack \| Tool      |
| Executor \| Conversation History \| Usage Metering                    |
|                                                                       |
| Deploy targets: BOX-3 (audio) \| Telegram (text) \| Web Link (chat)   |
| \| Scheduled (autonomous)                                             |
+-----------------------------------------------------------------------+

  ------------- -------------------------------------------------------------
  **✓ DESIGN    Improving the runtime once improves every deployed agent
  PRINCIPLE**   everywhere simultaneously. A kid\'s BOX-3 agent and their
                Telegram bot will both benefit from every runtime improvement
                without any action from the kid.

  ------------- -------------------------------------------------------------

**1.3 Why These Three Together**

The Runtime, Backpack, and Study Mode are deeply interdependent. The
runtime is needed to run any agent. The backpack is how agents gain
specialized knowledge that makes them genuinely useful. Study Mode is
how that knowledge becomes educational --- the backpack\'s content
becomes quiz material, spaced repetition tracks what the kid knows, and
gap detection drives backpack growth. Separating them into independent
features would leave each one significantly less valuable.

  -----------------------------------------------------------------------
  **2. Elisa Agent Runtime**

  -----------------------------------------------------------------------

**2.1 What It Is**

The Elisa Agent Runtime is a persistent cloud service that holds a
kid\'s agent configuration and executes every conversation turn. It is
the difference between a blueprint and a building --- the canvas is
where you design, the runtime is where the agent lives and works.

Every agent deployed from Elisa --- regardless of target --- gets a
provisioned entry in the runtime. That entry persists until explicitly
deleted. Deploy targets (firmware on a BOX-3, a Telegram bot hook, a web
chat URL) are thin interface layers. All intelligence lives in the
runtime.

**2.2 Agent Identity Store**

At deploy time, the runtime compiles the kid\'s NuggetSpec into a stored
agent configuration. This is what makes the agent this agent and not a
generic chatbot.

  ------------------- ----------------------------------------------------
  **Field**           **Description**

  system_prompt       Synthesized from NuggetSpec goal, requirements,
                      personality, and behavior blocks. Passed to Claude
                      on every turn.

  agent_name          Display name. Used in greeting, touchscreen,
                      conversation history.

  greeting            First thing the agent says on power-on or first
                      connection (1-2 sentences).

  fallback_response   What the agent says when it cannot answer or
                      retrieve relevant info.

  topic_index         Structured list of domains this agent knows about.
                      Used to decide when to search the backpack vs. rely
                      on base Claude knowledge.

  tool_configs        Portal integrations from the NuggetSpec. Weather,
                      sports, search, custom APIs.

  voice               TTS voice identifier (e.g., \'nova\', \'onyx\').
                      Used by audio-output deploy targets.

  display_theme       Visual theme name. Used by screen-equipped deploy
                      targets like the BOX-3.

  study_config        Study Mode settings if a Study Mode block is present
                      (style, difficulty, quiz frequency, spaced
                      repetition state).
  ------------------- ----------------------------------------------------

**2.3 Conversation Turn Pipeline**

Every incoming turn --- from any deploy target --- executes the same
pipeline in the runtime:

1.  Receive input --- audio bytes (BOX-3/voice targets), text
    (Telegram/web), or a scheduled trigger.

2.  STT if needed --- for audio input, transcribe via Whisper API.
    Target latency: under 500ms.

3.  Backpack retrieval --- search the agent\'s knowledge backpack for
    chunks relevant to the query. Retrieve top 3--5 chunks by semantic
    similarity. Skip if backpack is empty or query is clearly in base
    Claude knowledge.

4.  Context assembly --- construct the full prompt: system prompt +
    retrieved backpack chunks + conversation history (last N turns) +
    current user input.

5.  Claude API call --- call Claude with assembled context. Stream the
    response.

6.  Tool execution --- if Claude\'s response includes a tool call
    (Portal), execute it, inject the result, and continue generation.

7.  Response post-processing --- strip markdown for voice targets. Allow
    richer formatting for text targets.

8.  TTS if needed --- for audio-output targets, run response through
    TTS. Stream audio back to device.

9.  History update --- store the exchange in conversation history for
    this session.

10. Gap detection --- if backpack retrieval returned no relevant
    results, log the topic as a potential gap and surface it to the kid.

**2.4 Conversation History**

History is stored per (agent_id, session_id) pair. A session is a
continuous interaction window. For the BOX-3, a new session begins each
time the device reconnects after power-off.

-   **Short-term (current session):** Passed to Claude on every turn to
    maintain context. The runtime manages window size to stay within
    Claude\'s context limits --- older turns are summarized rather than
    dropped.

-   **Long-term (cross-session):** Stored in the runtime database.
    Surfaced to the kid via the Agent Management Page (Phase 2).
    Requires parental consent for under-13 users. See Section 6
    (Privacy).

**2.5 Redeploy Without Reflash**

  ------------ -------------------------------------------------------------
  **⚡         When a kid changes their agent\'s spec in Elisa and
  CRITICAL UX  redeploys, the runtime updates the stored agent identity
  PROPERTY**   without touching any deployed firmware. The agent\'s next
               conversation uses the updated config automatically. No device
               interaction required.

  ------------ -------------------------------------------------------------

The deploy pipeline must distinguish between two redeploy cases and show
the appropriate UI:

-   **Config-only change** (personality, backpack, tools, voice): Update
    runtime via PUT /v1/agents/:id. Complete in \~5--10 seconds. Show:
    \"Agent updated ✓\"

-   **Firmware-required change** (WiFi credentials, wake word on BOX-3):
    Requires device reflash. Show flash wizard. This distinction is
    determined by the deploy target plugin, not the runtime.

**2.6 Tool Executor**

When Claude decides to use a configured Portal tool, the runtime
executes it without involving the deploy target:

-   Look up tool config from agent identity

-   Make the external API call (weather, sports scores, news, custom
    webhook, etc.)

-   Format the result for context injection

-   Continue the conversation turn with the tool result included

The same Portal block system used in Elisa for hardware integrations
also drives runtime tool integrations. A Portal block in the NuggetSpec
becomes a callable tool in the runtime. This unifies the hardware and
software portal concepts.

**2.7 Request Router**

Each deployed agent receives a unique agent_id at provisioning time.
Every incoming request --- regardless of origin --- carries this
agent_id. The router uses it to load the correct agent identity and
conversation history before processing begins. This enables one runtime
instance to serve thousands of distinct agents simultaneously.

**2.8 Usage Metering**

Every turn is metered: Claude API tokens consumed, TTS characters, STT
seconds, backpack search operations. This data feeds the business model
tier system and the parent dashboard. Kids see a simplified
\"conversations this week\" count, not token counts.

**2.9 API Surface**

The runtime exposes a minimal REST + WebSocket API consumed by deploy
target plugins. This is the contract between the runtime and all current
and future deploy targets.

  --------------------------- -------------------------------------------
  **Endpoint**                **Purpose**

  POST /v1/agents             Provision a new agent at deploy time.
                              Returns agent_id, api_key, runtime_url.

  PUT /v1/agents/:id          Update agent config on redeploy (no
                              firmware change needed).

  DELETE /v1/agents/:id       Deprovision agent and delete all associated
                              data.

  POST                        Submit a text turn, receive text response.
  /v1/agents/:id/turn/text    Used by Telegram, web link targets.

  POST                        Submit audio bytes, receive audio bytes.
  /v1/agents/:id/turn/audio   Used by simple audio targets.

  WS /v1/agents/:id/stream    WebSocket for streaming audio. Used by
                              BOX-3 and other real-time voice targets.

  GET /v1/agents/:id/history  Retrieve conversation history (requires
                              parental consent flag for under-13).

  GET /v1/agents/:id/gaps     Retrieve detected knowledge gaps for the
                              backpack suggestion system.

  GET                         Check if a device-hosted agent is online.
  /v1/agents/:id/heartbeat    Used by flash wizard.
  --------------------------- -------------------------------------------

  --------- -------------------------------------------------------------
  **AUTH    All endpoints require agent_id and api_key provisioned at
  NOTE**    deploy time. The api_key is device-specific and scoped to a
            single agent. It is never shown to the kid --- it is managed
            entirely by the deploy pipeline.

  --------- -------------------------------------------------------------

**2.10 Infrastructure**

-   Service: Node.js or Python --- deployed to Cloud Run

-   Scaling: min-instances: 1 (runtime must respond immediately --- no
    cold start on voice wake)

-   Database: PostgreSQL with pgvector extension (unified relational +
    vector storage)

-   Consistent with existing cloud dashboard plugin infrastructure

  -----------------------------------------------------------------------
  **3. Knowledge Backpack**

  -----------------------------------------------------------------------

**3.1 What It Is**

The Knowledge Backpack is a per-agent RAG system that gives agents
access to specialized knowledge beyond Claude\'s base training. A kid\'s
history tutor agent can know their specific textbook. A soccer agent can
know this week\'s match results. A mechanic agent can know the service
manual for a specific vehicle.

  ----------- -------------------------------------------------------------
  **FRAMING   The Backpack is NEVER described to kids using technical
  RULE**      terms. No \"RAG\", no \"vector database\", no \"embeddings\".
              Kids hear: \"your agent\'s backpack\" and \"what your agent
              can look things up in.\" The metaphor is complete --- fill it
              with materials, your agent can reference them.

  ----------- -------------------------------------------------------------

**3.2 Backpack Canvas Block**

A new block in the Elisa toolbox under a new \"Knowledge\" category. It
is the kid\'s entry point into the backpack system.

+-----------------------------------------------------------------------+
| **Block: Agent Backpack**                                             |
|                                                                       |
| 🎒 Agent Backpack \[Open Backpack\] 3 sources · 47 pages              |
|                                                                       |
| The block is minimal on the canvas. Its main function is to open the  |
| Backpack Editor modal and include backpack configuration in the       |
| NuggetSpec. The summary line gives the kid a quick sense of what      |
| their agent knows.                                                    |
+-----------------------------------------------------------------------+

**3.3 Backpack Editor Modal**

The Backpack editor is an Agent Meeting-style interface. It is not a
settings form --- it is a collaborative session with the Knowledge
Agent.

-   **Layout:** Two-column. Left: current backpack contents as source
    cards. Right: Knowledge Agent chat panel for suggestions and
    conversation.

-   **Knowledge Agent behavior:** When the kid\'s NuggetSpec has a
    defined goal, the Knowledge Agent proactively suggests relevant
    sources. Example: \"I found a Wikipedia overview of Southeast Asian
    history, a Khan Academy unit on the Vietnam War, and a YouTube
    lecture on the Khmer Rouge. Want me to add any of these?\" The kid
    taps to approve individual suggestions.

-   **Source cards:** Show source title, type icon
    (PDF/URL/YouTube/Drive/Topic Pack), chunk count, last updated date,
    and a remove button. Living sources show a pulse icon and a \"last
    synced\" timestamp.

**3.4 Source Types**

**Fixed Sources --- Added Once, Stable**

-   PDF upload --- drag or browse. Supports textbooks, worksheets,
    exported notes, research papers.

-   URL snapshot --- paste any URL. Elisa fetches and ingests the
    content at that moment. Shows preview card with page count.

-   YouTube video --- paste a link. Elisa pulls the auto-generated
    transcript and ingests it. Every educational YouTube video becomes a
    knowledge source.

-   Google Drive document --- paste a Doc link or connect a Drive
    folder. All documents in a connected folder are ingested. Folder
    sync can be set to automatic.

**Living Sources --- Updated Automatically**

-   Topic Pack --- curated knowledge bases maintained by Elisa.
    Examples: \"Southeast Asian History: AP World History\", \"New
    England Revolution 2025 Season\", \"Minecraft 1.21 Crafting Guide\".
    One tap to add. Updated by Elisa when source material changes.

-   Sports Feed --- connects to a sports data API for a team or league.
    Updates before each match day. Includes roster, recent results,
    standings, upcoming fixtures.

-   News Feed --- connects to an RSS or news API for a topic.
    Configurable update schedule (hourly/daily). Suitable for \"AI news
    this week\" agents.

-   Custom Feed --- a URL returning structured JSON or RSS data. For
    advanced users (parent/teacher level) connecting custom sources.

**3.5 Ingestion Pipeline**

Triggered server-side when a kid adds a source. Runs asynchronously. Kid
sees a \"processing\...\" state on the source card, then a confirmation
with chunk count.

11. Fetch --- retrieve content from source (download PDF, fetch URL,
    pull YouTube transcript, call API).

12. Parse --- extract clean text, strip HTML/formatting artifacts,
    handle multi-page documents.

13. Chunk --- split into overlapping chunks of \~300--400 tokens.
    Overlap of \~50 tokens prevents context loss at boundaries.

14. Embed --- generate vector embeddings using OpenAI
    text-embedding-3-small (or configurable alternative). Store in
    pgvector.

15. Index metadata --- store source title, type, date, chunk count, and
    associated agent_id.

16. Confirm --- send completion event to Backpack editor: \"Added: 12
    pages about the Vietnam War.\"

**3.6 Retrieval at Query Time**

When the runtime receives a user query, before calling Claude:

17. Embed the query using the same model used for ingestion.

18. Run pgvector similarity search against all chunks for this agent_id.

19. Retrieve top 5 chunks by cosine similarity, filtered above a minimum
    similarity threshold (tune during development --- too low pollutes
    context, too high misses useful partial matches).

20. Prepend retrieved chunks to context as a clearly labeled section.

21. Claude synthesizes a response using both retrieved context and base
    knowledge.

  ---------------- -------------------------------------------------------------
  **VOICE          For voice-output targets (BOX-3), retrieved chunks must be
  OPTIMIZATION**   summarized before injection if they are long. The goal is a
                   1--3 sentence spoken answer, not a textbook recitation. The
                   runtime post-processing step handles this per target type.

  ---------------- -------------------------------------------------------------

**3.7 Gap Detection & Backpack Growth**

When retrieval returns no relevant results (below threshold), the
runtime logs the topic as a gap:

-   Stores (agent_id, query_text, timestamp) in the gaps table.

-   After the turn, surfaces the gap to the kid in Elisa: \"Cosmo
    wasn\'t sure about that. Want to add something to the backpack about
    \[topic\]?\" with a suggested source.

-   The Knowledge Agent in the Backpack editor periodically reviews gaps
    and makes proactive suggestions: \"I noticed Cosmo was asked about
    the Spice Trade three times this week without good info. Should I
    add something?\"

This feedback loop grows the backpack organically through real usage ---
the kid doesn\'t have to plan their knowledge base upfront.

**3.8 Agent Management Page**

A web page accessible from the deploy success screen and Elisa sidebar
that shows the kid their agent\'s activity. Not a technical admin panel
--- a companion to the Elisa experience.

-   **Recent Conversations:** Timeline of sessions with summary cards.
    Each card shows date, duration, and a 1-sentence summary. Tap to
    expand to full transcript (with parental consent).

-   **Backpack:** Mirrors the Backpack editor. Shows sources,
    live-source sync times, and detected gaps.

-   **Gaps & Suggestions:** Knowledge Agent suggestions based on
    conversation history. One-tap approval.

-   **Agent Health:** Conversations this week, average response time,
    backpack size, topics covered.

-   **Update Agent:** Deep link back to the Elisa canvas.

  -----------------------------------------------------------------------
  **4. Study Mode**

  -----------------------------------------------------------------------

**4.1 What It Is**

Study Mode is a behavioral layer that turns any
knowledge-backpack-equipped agent into a capable tutor. It changes how
the agent uses backpack content --- instead of always answering, it
alternates between explaining and quizzing. It tracks what the kid knows
and applies spaced repetition logic to surface topics that need review.

Study Mode is not a separate product. It is an optional behavioral
configuration layered on top of the runtime and backpack. Any agent with
a Knowledge Backpack can have Study Mode enabled.

**4.2 Study Mode Canvas Block**

A new block in the \"Knowledge\" toolbox category, placed alongside the
Backpack block.

+-----------------------------------------------------------------------+
| **Block: Study Mode**                                                 |
|                                                                       |
| 📚 Study Mode                                                         |
|                                                                       |
| Style: \[ Quiz Me ▼ \]                                                |
|                                                                       |
| Difficulty: \[ Medium ▼ \]                                            |
|                                                                       |
| Quiz every: \[ Every 3 turns ▼ \]                                     |
+-----------------------------------------------------------------------+

**4.3 Study Style Options**

  ---------------- -------------------------------------------------------
  **Style**        **Behavior**

  **Explain**      Always explains, never quizzes. Agent is a reference
                   assistant. Good for lookup agents.

  **Quiz Me**      Alternates explain and quiz turns on a configurable
                   frequency. Default and recommended style.

  **Flashcards**   Strict quiz mode --- agent always asks a question
                   first, answers only after the kid responds.

  **Socratic**     Agent answers questions with questions, guiding the kid
                   to the answer. Advanced mode.
  ---------------- -------------------------------------------------------

**4.4 Spaced Repetition**

The runtime tracks quiz performance per topic in a study_state object
stored alongside the agent identity:

-   When the kid answers a quiz question correctly, that topic\'s review
    interval increases.

-   When the kid answers incorrectly, the topic is flagged for earlier
    re-review.

-   Backpack retrieval is weighted toward topics due for review --- the
    agent prioritizes asking about things the kid has struggled with or
    hasn\'t seen recently.

-   After each session, the study_state is persisted to the runtime
    database. Progress accumulates across sessions.

The kid experiences this as: \"Your agent remembers what you got wrong\"
--- not as a technical system.

**4.5 Quiz Generation**

When it is time to quiz (based on frequency setting), the runtime:

22. Identifies the highest-priority topic based on spaced repetition
    state.

23. Retrieves relevant backpack chunks for that topic.

24. Passes the chunks to Claude with an instruction to generate a quiz
    question appropriate for the difficulty level.

25. Presents the question to the kid.

26. Evaluates the kid\'s response (Claude judges correctness against the
    retrieved content).

27. Gives feedback, provides the correct answer if wrong, and updates
    study_state.

  -------------- -------------------------------------------------------------
  **VOICE        For voice targets, quiz questions must be answerable
  ADAPTATION**   verbally. The runtime should avoid questions requiring the
                 kid to name lists, spell things, or provide exact dates ---
                 unless the kid has been studying those specifically. Prefer
                 short-answer and conceptual questions for voice mode.

  -------------- -------------------------------------------------------------

  -----------------------------------------------------------------------
  **5. Implementation Phases**

  -----------------------------------------------------------------------

+-----------+-------------------------+-------------------------------+
| **Phase** | **Deliverables**        | **Notes**                     |
+-----------+-------------------------+-------------------------------+
| **Phase 1 | -   Runtime: agent      | Enables BOX-3 plugin          |
| MVP**     |     provisioning +      | (PRD-002). Runtime and basic  |
|           |     identity store      | backpack must ship together   |
|           |     (PostgreSQL)        | --- neither is useful alone.  |
|           |                         |                               |
|           | -   Runtime: text turn  |                               |
|           |     API + WebSocket     |                               |
|           |     streaming audio API |                               |
|           |                         |                               |
|           | -   Runtime:            |                               |
|           |     current-session     |                               |
|           |     conversation        |                               |
|           |     history             |                               |
|           |                         |                               |
|           | -   Runtime: basic tool |                               |
|           |     executor (Portal    |                               |
|           |     calls)              |                               |
|           |                         |                               |
|           | -   Runtime: usage      |                               |
|           |     metering (token     |                               |
|           |     counting)           |                               |
|           |                         |                               |
|           | -   Runtime: deployed   |                               |
|           |     to Cloud Run,       |                               |
|           |     min-instances: 1    |                               |
|           |                         |                               |
|           | -   Backpack: PDF + URL |                               |
|           |     ingestion pipeline  |                               |
|           |                         |                               |
|           | -   Backpack: pgvector  |                               |
|           |     storage + retrieval |                               |
|           |                         |                               |
|           | -   Backpack: basic gap |                               |
|           |     detection (log      |                               |
|           |     only, no UI)        |                               |
|           |                         |                               |
|           | -   Backpack: canvas    |                               |
|           |     block + editor      |                               |
|           |     modal (manual       |                               |
|           |     source management)  |                               |
|           |                         |                               |
|           | -   Study Mode: block + |                               |
|           |     Quiz Me style only  |                               |
|           |                         |                               |
|           | -   Study Mode: basic   |                               |
|           |     spaced repetition   |                               |
|           |     state (in-session   |                               |
|           |     only)               |                               |
+-----------+-------------------------+-------------------------------+
| **Phase 2 | -   Knowledge Agent     | Delivers the full learning    |
| Kn        |     Meeting in backpack | experience and closes the     |
| owledge** |     editor (proactive   | gap-detection feedback loop.  |
|           |     suggestions)        |                               |
|           |                         |                               |
|           | -   YouTube transcript  |                               |
|           |     ingestion           |                               |
|           |                         |                               |
|           | -   Google Drive sync   |                               |
|           |                         |                               |
|           | -   Living sources:     |                               |
|           |     sports feeds, news  |                               |
|           |     feeds               |                               |
|           |                         |                               |
|           | -   All Study Mode      |                               |
|           |     styles (Flashcards, |                               |
|           |     Socratic)           |                               |
|           |                         |                               |
|           | -   Cross-session       |                               |
|           |     spaced repetition   |                               |
|           |     persistence         |                               |
|           |                         |                               |
|           | -   Cross-session       |                               |
|           |     conversation        |                               |
|           |     history (with       |                               |
|           |     parental consent)   |                               |
|           |                         |                               |
|           | -   Gap suggestions     |                               |
|           |     surfaced to kid in  |                               |
|           |     Elisa               |                               |
|           |                         |                               |
|           | -   Agent Management    |                               |
|           |     Page (web)          |                               |
|           |                         |                               |
|           | -   Parent dashboard    |                               |
|           |     (session summaries) |                               |
+-----------+-------------------------+-------------------------------+
| **Phase 3 | -   Second deploy       | Validates runtime as a true   |
| P         |     target (Telegram    | platform. Each new deploy     |
| latform** |     bot plugin)         | target proves the             |
|           |                         | architecture. Tier system     |
|           | -   Third deploy target | enables business model.       |
|           |     (shareable web link |                               |
|           |     plugin)             |                               |
|           |                         |                               |
|           | -   Scheduled /         |                               |
|           |     autonomous agent    |                               |
|           |     support             |                               |
|           |                         |                               |
|           | -   Topic Pack library  |                               |
|           |     (curated by Elisa)  |                               |
|           |                         |                               |
|           | -   Runtime tier system |                               |
|           |     (free / paid usage  |                               |
|           |     limits)             |                               |
|           |                         |                               |
|           | -   Multi-agent routing |                               |
|           |     (kid has multiple   |                               |
|           |     deployed agents)    |                               |
|           |                         |                               |
|           | -   Long-term memory    |                               |
|           |     injection into      |                               |
|           |     system prompt       |                               |
+-----------+-------------------------+-------------------------------+

  -----------------------------------------------------------------------
  **6. Privacy & Safety**

  -----------------------------------------------------------------------

**6.1 COPPA Compliance (Under-13 Users)**

Conversation history storage requires explicit parental consent. The
first deploy of any agent with a kid account under 13 must trigger a
parent consent flow before any history is retained. Three options
presented to the parent:

-   Store session summaries only (default) --- no full transcripts
    retained

-   Store full transcripts --- accessible to parent, not surfaced to kid
    by default

-   No history --- agent has no cross-session memory

The runtime must enforce these settings at the data persistence layer,
not just the UI layer.

**6.2 Parent Dashboard**

Parents can access their child\'s Agent Management Page with elevated
permissions: full conversation transcripts (if opted in), backpack
content review, agent disable, and topic restriction settings.

**6.3 Content Guardrails**

The system prompt generated for every agent by the Elisa builder minion
must include standing safety instructions, regardless of what the kid\'s
NuggetSpec says:

-   Age-appropriate content only --- redirect inappropriate topics to
    trusted adults

-   No sharing of personal identifying information (home address, school
    name, phone number)

-   Default to \"I\'m not sure --- ask a trusted adult\" for medical,
    legal, and safety topics

-   Never claim to be a real person or authority figure

  --------------- -------------------------------------------------------------
  **ENFORCEMENT   Guardrails must be injected at the runtime level into the
  NOTE**          system prompt, not relied on solely from the canvas-generated
                  prompt. This prevents a kid from accidentally (or
                  intentionally) removing safety instructions by modifying
                  their NuggetSpec.

  --------------- -------------------------------------------------------------

  -----------------------------------------------------------------------
  **7. Open Questions for Development**

  -----------------------------------------------------------------------

These decisions should be resolved during the Claude Code implementation
session, not before it. They are documented here so the dev session
starts with full context.

  -------- ------------------- ------------------------------------------------
  **\#**   **Question**        **Recommendation / Context**

  **1**    **STT provider and  OpenAI Whisper is simplest. Target: speech-end
           latency**           to audio-start under 2 seconds total. If Whisper
                               latency is too high, consider Google
                               Speech-to-Text streaming API for real-time
                               transcription.

  **2**    **TTS provider**    Start with OpenAI TTS (high quality). Make
                               provider configurable in runtime config ---
                               abstract behind an interface so it can be
                               swapped without code changes. ElevenLabs and
                               Google TTS as alternatives.

  **3**    **Embedding model** OpenAI text-embedding-3-small is cheap and high
                               quality. For scale, consider a local embedding
                               model in the runtime container to eliminate
                               per-embedding API costs. Decide based on
                               projected usage volume.

  **4**    **Backpack chunk    300--400 tokens recommended as starting point.
           size**              Tune based on real kid queries during testing
                               --- too small loses context, too large dilutes
                               relevance ranking.

  **5**    **Retrieval         Start conservative (high threshold) to avoid
           similarity          polluting context with irrelevant chunks. Lower
           threshold**         if gap detection fires too frequently. This is a
                               runtime config value, not hardcoded.

  **6**    **Spaced repetition SM-2 is the classic algorithm and
           algorithm**         well-documented. Simpler alternatives exist.
                               Either is fine for Phase 1 --- the study_state
                               schema should be designed to accommodate
                               algorithm changes later.

  **7**    **Multi-agent per   Each deployed agent has its own agent_id. A kid
           kid**               can have multiple agents (e.g., history tutor +
                               soccer companion). The runtime handles this
                               naturally via routing. Design the Agent
                               Management Page to support multiple agents from
                               Phase 1.
  -------- ------------------- ------------------------------------------------

--- END OF PRD-001 ---
