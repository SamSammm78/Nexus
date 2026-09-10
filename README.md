# NEXUS

NEXUS is a personal AI copilot designed to become a persistent assistant for projects, tools, files, email, navigation, local AI, voice interaction and contextual workflows.

The long-term goal is to build **one NEXUS Core** shared by several interfaces:

- Voice Overlay
- Compact CLI
- Full HUD / Workspace
- Context Copilot for VS Code and Chrome

The model can change, tools can evolve independently, and memory belongs to NEXUS rather than to one AI provider.

---

## Vision

NEXUS should progressively be able to:

- understand natural-language requests;
- choose the correct route or tool;
- use local and cloud AI models;
- interact with Gmail, Drive, Tasks and Calendar;
- browse and act through Playwright;
- understand the active project and current work context;
- remember project decisions and useful preferences;
- resume work where it was left;
- assist by voice;
- remain available through a persistent desktop / overlay experience.

```text
                 NEXUS CORE
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
 Voice Overlay      CLI      Full Workspace
        │            │            │
        └────────────┼────────────┘
                     │
                  Tools
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Gmail       Browser      Projects
      Drive        Maps         Memory
      Tasks        Files        Calendar
```

---

## Current project structure

```text
Nexus/
├── src/
│   ├── index.js                     # headless bootstrap (Core only)
│   ├── agent/
│   │   ├── nexus.js                 # Core: context, routing, model, tools
│   │   ├── router.js                # Gemini router (routes below)
│   │   └── systemPrompt.js          # global system prompt
│   ├── cli/
│   │   └── index.js                 # terminal interface (blessed)
│   ├── config/
│   │   └── gemini.js
│   ├── models/
│   │   ├── index.js
│   │   ├── gemini.js
│   │   ├── local.js
│   │   └── localBrowserAgent.js
│   ├── mcp/
│   │   ├── client.js
│   │   └── servers.js
│   ├── memory/
│   │   └── shortTerm.js
│   ├── services/
│   │   ├── google/
│   │   │   ├── auth.js
│   │   │   ├── gmail.js
│   │   │   └── calendar.js
│   │   ├── nas/
│   │   │   ├── client.js
│   │   │   ├── files.js
│   │   │   └── system.js
│   │   ├── mapRoute.js
│   │   └── map/
│   │       └── server.js
│   ├── tools/
│   │   ├── index.js
│   │   ├── time.js
│   │   ├── webSearch.js
│   │   ├── weather.js
│   │   ├── nas.js
│   │   ├── home_automation.js
│   │   ├── google/
│   │   │   ├── gmail.js
│   │   │   └── calendar.js
│   │   └── navigation/
│   │       ├── index.js
│   │       ├── transit.js
│   │       ├── disruptions.js
│   │       └── driving.js
│   └── voice/
├── credentials/
│   ├── google-oauth.json
│   └── google-token.json
├── data/
│   └── current-route.json
├── map.html
├── .env
├── package.json
└── README.md
```

---

## Core

The NEXUS Core is responsible for:

- receiving the user request;
- loading recent context;
- routing the request;
- exposing only relevant tools;
- calling the selected AI model;
- executing tools;
- returning the final response;
- later: updating project memory and persistent state.

All interfaces should use the same Core.

---

## Router

The router remains Gemini-based.

Routes:

```text
DIRECT
WEB_SEARCH
WEATHER
BROWSER
NATIVE
NAVIGATION
GMAIL
CALENDAR
NAS
```

Examples:

```text
"Quelle heure est-il ?"
→ NATIVE

"Quel temps fera-t-il demain ?"
→ WEATHER

"Ouvre YouTube et cherche..."
→ BROWSER

"Quels mails ai-je reçus aujourd'hui ?"
→ GMAIL

"Quels sont mes événements de demain ?"
→ CALENDAR

"Allume le NAS."
→ NAS
```

The router should remain lightweight and should not receive unnecessary tool payloads.

---

## AI providers

### Gemini

Gemini currently acts as the high-level routing / reasoning layer.

```js
import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
```

### Local AI

Local models can be used for:

- conversation;
- lightweight reasoning;
- offline tasks;
- fallback;
- experimentation.

Technologies explored:

```text
Qwen
Gemma
LM Studio
Ollama
```

### Raspberry Pi + Ollama

Example endpoint:

```text
http://nexus.local:12345
```

Useful endpoints:

```text
GET  /api/tags
POST /api/generate
POST /api/chat
```

Example streaming request:

```js
const response = await fetch(
  "http://nexus.local:12345/api/generate",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen2.5:1.5b",
      prompt: "Hello NEXUS",
      stream: true,
      keep_alive: "10m",
    }),
  }
);
```

Streaming is preferred for interfaces so text can appear as soon as the first token arrives.

---

## Model abstraction

The model layer should keep providers interchangeable.

Conceptual API:

```js
generateText({
  prompt,
  systemPrompt,
  provider,
  localModel,
});
```

Possible providers:

```text
gemini
local
ollama
```

Future fallback:

```text
Request
   │
   ▼
Local model
   │
   ├── success → response
   └── failure / insufficient result
             │
             ▼
           Gemini
```

---

## Native tools

Native tools are registered centrally.

```js
export const nativeTools = [
  timeTool,
  webSearchTool,
  weatherTool,

  transitTool,
  disruptionsTool,
  drivingTool,

  ...gmailTools,
  ...calendarTools,

  changeDeviceState,
  getDeviceId,
  getDeviceState,
  setCountdown,

  wake_on_lan_nas,
  listSharedFoldersNas,
  listNasFoldersNas,
  getPingNas,
  setNasStatus,
];
```

Important: when a module exports an array of tools, spread it with `...gmailTools`.

---

## MCP

### Playwright MCP

```js
export const mcpServers = {
  playwright: {
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
  },
};
```

Playwright should be used for real browser interaction:

- navigating websites;
- clicking;
- filling forms;
- reading page state;
- multi-step workflows.

Simple factual lookup should use search tools instead.

---

## Gmail integration

Files:

```text
src/services/google/auth.js
src/services/google/gmail.js
src/tools/google/gmail.js
```

Credentials:

```text
credentials/google-oauth.json
credentials/google-token.json
```

Add to `.gitignore`:

```gitignore
credentials/
.env
```

### Gmail tools

```text
get_recent_emails
search_emails
read_email

create_email_draft
get_email_drafts
create_reply_draft

mark_email_read
mark_email_unread
archive_email
trash_email

send_email_draft
```

Sending email should require explicit confirmation.

Recommended flow:

```text
User asks for reply
        ↓
NEXUS reads message
        ↓
NEXUS drafts reply
        ↓
create_email_draft
        ↓
show draft
        ↓
user confirms
        ↓
send_email_draft
```

---

## Google Calendar

Calendar V1 is integrated on the same OAuth foundation as Gmail:

```text
src/services/google/calendar.js
src/tools/google/calendar.js
```

Tools: list / read events, create events, update and delete events.

## Google roadmap

After Gmail and Calendar:

```text
Google Drive
Google Tasks
```

The same OAuth foundation should be reused.

---

## NAS & home automation

NEXUS can control a Synology NAS and home devices:

```text
NAS     → Wake on LAN, authentication, shared folder listing, status
Tuya    → device state, countdown timers, device discovery
```

Files:

```text
src/services/nas/client.js
src/services/nas/files.js
src/services/nas/system.js
src/tools/nas.js
src/tools/home_automation.js
```

NAS access stays local and requires explicit credentials in `.env`.

---

## Navigation

NEXUS already includes navigation work using:

- Île-de-France Mobilités data;
- OpenRouteService;
- MapLibre;
- local map server.

Architecture:

```text
Full API payload
      │
      ├── geometry → map
      └── compact data → LLM
```

Large GeoJSON payloads should not be sent to the language model.

---

## Short-term memory

Current short-term memory should contain:

```text
recent user messages
recent assistant answers
active route
active project
current file / app context
recent action
```

Avoid storing full large tool responses in the conversation history.

---

## Memory Brain

The long-term objective is to give NEXUS persistent memory independent of the selected model.

Planned memory types:

```text
WORKING MEMORY
SEMANTIC MEMORY
EPISODIC MEMORY
PROJECT MEMORY
DECISION MEMORY
PREFERENCE MEMORY
PROCEDURAL MEMORY
```

Architecture:

```text
                     MEMORY BRAIN
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
     Working           Project          Long-term
      Memory            Memory            Memory
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
                    Memory Retriever
                          │
                          ▼
                  relevant memories only
                          │
                          ▼
                         LLM
```

### Memory V1

Recommended:

```text
SQLite
```

Database:

```text
data/nexus-memory.db
```

Possible tables:

```text
memories
projects
project_events
decisions
relationships
```

Example memory:

```json
{
  "type": "decision",
  "projectId": "nexus",
  "content": "Gemini remains the main router.",
  "importance": 0.9,
  "confidence": 1.0
}
```

Future Memory V2:

```text
embeddings
semantic search
deduplication
automatic consolidation
memory aging
confidence
importance
relationships
graph-like memory
```

---

## Project Copilot

Projects become first-class entities inside NEXUS.

```text
                         NEXUS CORE
                              │
                       PROJECT MANAGER
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
      Context              Execution              Memory
```

Each project can contain:

```text
name
goal
status
workspace
Drive folder
task list
current focus
milestones
decisions
activity
checkpoint
```

Example:

```json
{
  "id": "nexus",
  "name": "NEXUS",
  "status": "active",
  "goal": "Build a personal AI assistant",
  "currentFocus": "Ship Project Copilot Core"
}
```

Planned project tools:

```text
project_create
project_get
project_update
project_search
project_action
```

Example commands:

```text
"Travaille sur Nexus."
"Où en étions-nous ?"
"Ajoute ça à la roadmap."
"Crée une tâche."
"Fais un checkpoint."
"Quelle est la prochaine action ?"
"Pourquoi avions-nous choisi cette architecture ?"
```

### Checkpoints

A checkpoint should save:

```text
current focus
completed work
open problems
next actions
important decisions
```

Then `"Reprends Nexus"` can restore project state immediately.

---

## Context Copilot

NEXUS should understand the context of the application currently being used.

Planned contexts:

```text
Screen
VS Code
Chrome
Files
Terminal
```

### VS Code

Future extension context:

```json
{
  "app": "vscode",
  "workspace": "/path/to/Nexus",
  "activeFile": "src/agent/nexus.js",
  "language": "javascript",
  "selection": "...",
  "cursorLine": 420,
  "diagnostics": []
}
```

Permissions should remain explicit:

```text
READ
PREVIEW
WRITE
```

---

## Voice / HUD

Official orb states:

```text
IDLE
LISTENING
WORKING
SPEAKING
```

The full orb changes scale according to audio volume during listening and speaking.

Flow:

```text
User speaks
    ↓
LISTENING
    ↓
request starts
    ↓
WORKING
    ↓
first response token
    ↓
SPEAKING
    ↓
response complete
    ↓
IDLE
```

Visual identity:

```text
dark background
cyan / white
fine technical lines
holographic neural orb
minimal glow
technical HUD
```

---

## Interfaces

### Voice Overlay

Small top-screen assistant for:

```text
voice
notifications
short contextual cards
quick actions
```

### Compact CLI

```text
┌─────────────────────┬───────────────────────────────┐
│        ORB          │          CONVERSATION         │
│                     │                               │
│   ● CORE ONLINE     │                               │
├─────────────────────┴───────────────────────────────┤
│                     /help     Afficher l'aide        │
│                     /attach   Ajouter des fichiers   │
│  >                                                 │
└─────────────────────────────────────────────────────┘
```

Features: `/` command suggestions with ↑/↓ + Tab, custom input with cursor ←/→, file attachment (`/attach`), blinks like a native terminal block cursor.

Commands:

```text
/help     Afficher l'aide des commandes
/status   État de NEXUS
/attach   Ajouter des fichiers (chemins)
/files    Fichiers en attente
/detach   Retirer un fichier (index, nom ou all)
/project  Changer de projet (nom)
/model    Changer de modèle (nom)
/tools    Outils disponibles
/clear    Effacer la conversation
/exit     Quitter NEXUS
```

### Full Workspace

Used for:

```text
Projects
Memory
Gmail
Drive
Tasks
Calendar
Navigation
Files
Context
Activity
```

---

## Environment variables

Example `.env`:

```env
GEMINI_API_KEY=your_key_here

AI_PROVIDER=local
LOCAL_MODEL=qwen

LM_STUDIO_URL=http://192.168.x.x:1234

OLLAMA_URL=http://nexus.local:12345
OLLAMA_MODEL=qwen2.5:1.5b

TAVILY_API_KEY=your_key_here          # web search

NAS_IP=192.168.x.x
NAS_IP_SIMPLE=192.168.x.x
NAS_MAC=AA:BB:CC:DD:EE:FF             # Wake on LAN
NAS_USERNAME=your_user
NAS_PASSWORD=your_password

TUYA_ACCESS_ID=your_id                 # home automation
TUYA_ACCESS_SECRET=your_secret

IDFM_API_KEY=your_key_here             # Île-de-France Mobilités
ORS_API_KEY=your_key_here              # OpenRouteService
```

Never commit `.env`.

---

## Installation

Recommended requirements:

```text
Node.js
npm
Google API credentials
Chrome
optional: LM Studio
optional: Ollama
optional: Raspberry Pi
```

Install dependencies:

```bash
npm install
```

Create `.env` from the variables above, and add your Google OAuth credentials:

```bash
mkdir -p credentials
# place google-oauth.json (OAuth client) in credentials/
```

Google auth files are created on first run:

```text
credentials/google-oauth.json
credentials/google-token.json
```

Playwright MCP (optional, for browser interaction):

```bash
npx -y @playwright/mcp@latest
```

---

## Running NEXUS

The CLI is the main interactive interface:

```bash
node src/cli/index.js
```

Headless core (no interface, starts the router/tools):

```bash
node src/index.js
```

Map server (optional, for navigation rendering):

```text
http://localhost:8765/map.html
```

---

## Ollama on Raspberry Pi

Temporary network exposure:

```bash
OLLAMA_HOST=0.0.0.0:12345 ollama serve
```

Permanent systemd override:

```bash
sudo systemctl edit ollama
```

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:12345"
Environment="OLLAMA_MODELS=/usr/share/ollama/.ollama/models"
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Check:

```bash
ollama list
curl http://nexus.local:12345/api/tags
```

Example request:

```bash
curl http://nexus.local:12345/api/generate   -H "Content-Type: application/json"   -d '{
    "model":"qwen2.5:1.5b",
    "prompt":"Say only: NEXUS ONLINE",
    "stream":false
  }'
```

---

## Security principles

### Email

```text
Reading → allowed
Drafting → allowed
Sending → explicit confirmation
```

### Files

```text
Read → authorized directories only
Write → explicit permission
Delete → confirmation
```

### Credentials

Never commit:

```text
.env
credentials/
OAuth tokens
API keys
```

Recommended `.gitignore`:

```gitignore
node_modules/
.env
credentials/
data/*.db
.DS_Store
```

---

## Error handling

Planned:

```text
tool failure
    ↓
classify error
    ├── retry
    ├── alternative tool
    ├── fallback provider
    ├── ask user
    └── stop safely
```

Avoid infinite retry loops.

---

## Roadmap

```text
1. ✅ Gmail V1 (read, draft, send with confirmation)
   ✅ Google Calendar V1
   ✅ NAS (Wake on LAN, auth, folder listing)
   ✅ Tuya home automation
   ✅ CLI: command suggestions, file attach, custom input

2. Project Copilot Core
   - project registry
   - active project
   - goals
   - milestones
   - checkpoints
   - resume
   - next action
   - activity log
   - decision log

3. Memory Brain V1
   - SQLite
   - save/search/update/forget
   - project memory
   - decisions
   - events
   - preferences

4. Google Drive

5. Google Tasks

6. Voice Overlay
   - reactive orb
   - STT
   - TTS
   - ambient UI

7. Context Copilot

8. Deep VS Code integration

9. Compact CLI ✅ (see CLI section)

10. Location and personal places

11. Google Calendar ✅ (see Calendar section)

12. Intelligent error handling

13. Local file access

14. Persistent NEXUS Core service

15. Full Workspace / HUD

16. Proactivity

17. Memory Brain V2

18. Advanced local AI

19. Vault / Knowledge Base
```

Near-term order:

```text
Project Copilot Core
  ↓
Memory Brain V1
  ↓
Google Drive
  ↓
Google Tasks
  ↓
Voice Overlay
  ↓
Context Copilot / VS Code
```

---

## Design principles

### One Core

```text
Voice
CLI
HUD
VS Code
Chrome
```

must all communicate with the same Core.

### Minimal context

```text
API
├── full data → application / renderer
└── compact data → model
```

### Tool specialization

```text
Search → web tool
Site interaction → Playwright
Email → Gmail API
Navigation → navigation services
Projects → Project Manager
Memory → Memory Brain
```

### Provider independence

The model is a reasoning component.

NEXUS owns:

```text
memory
projects
tools
permissions
state
interfaces
```

---

## Long-term user experience

```text
Samuel:
"Nexus."

NEXUS:
LISTENING

Samuel:
"Reprends le projet sur lequel je travaillais."

NEXUS:
- detects active project;
- retrieves the latest checkpoint;
- loads relevant decisions;
- checks tasks;
- reads current VS Code context;
- reports what was completed;
- suggests the next action.

Samuel:
"Continue."

NEXUS:
- updates project state;
- uses tools;
- assists with code;
- creates or edits files when authorized;
- updates tasks;
- saves a checkpoint.
```

The objective is continuity.

NEXUS should know:

```text
what the user is doing
what project is active
what decisions were made
what tools are available
what remains to be done
what context is relevant now
```

without depending on an endlessly growing chat history.

---

## Current status

Major foundations already explored or implemented:

```text
Gemini routing
native tools
MCP / Playwright
web search
weather
navigation
MapLibre HUD
Google OAuth
Gmail V1 (read, draft, send with confirmation)
Google Calendar V1
NAS (Wake on LAN, auth, folder listing)
Tuya home automation
local AI abstraction
LM Studio
Ollama experimentation
short-term memory
CLI: command suggestions, file attachment, custom input
voice orb prototypes
HUD prototypes
```

Current objective:

```text
Project Copilot Core
```

Next:

```text
Google Drive
Google Tasks
```

---

> **ONE CORE. ONE MEMORY. MULTIPLE INTERFACES.**
