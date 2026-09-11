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
│   │   ├── shortTerm.js             # fenêtre de conversation courante
│   │   ├── brain.js                 # Memory Brain: remember/recall/update/forget
│   │   └── notes.js                 # fichiers .md + frontmatter (vault Obsidian)
│   ├── utils/
│   │   └── fs.js
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
│   │   ├── memory.js
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
├── memories/                        # vault Obsidian (notes de la mémoire longue)
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
  ...filesTools,

  ...memoryTools,
  ...projectTools,

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
Google Tasks
```

The same OAuth foundation should be reused.

---

## Files V1 ✅ (Google Drive + accès local)

Un système de fichiers unifié : vos documents locaux
(par défaut `~/Documents`, avec vos dossiers cours / TD)
et Google Drive, avec **le LOCAL en source prioritaire**
(modifiable d'un réglage).

```text
src/services/files/settings.js   → racine + priorité (data/files-config.json)
src/services/files/local.js      → recherche / list / lecture disque
src/services/google/drive.js     → recherche / list / lecture Google Drive
src/tools/files.js               → file_search / file_list / file_read
```

- `file_search` : recherche par nom, source `auto` = source prioritaire
  configurée puis repli automatique sur l'autre source.
- `file_list` : contenu d'un dossier (local : chemin relatif à la racine ;
  Drive : `folderId`, vide = « Mon Drive »).
- `file_read` : lecture texte (fichiers locaux via `path`, Drive via `fileId`).
  Les IMAGES et PDF sont joints automatiquement au modèle pour analyse
  (via `functionResponse.parts` `inlineData`, lire les fichiers visuels sans
  `/attach`). Au-delà de ~18 Mo, le fichier est signalé sans contenu.
- `file_write` : crée/écrase un fichier texte local (écrasement = confirmation).
- `file_mkdir` : crée des dossiers (récursif) dans la racine locale.
- `file_download` : télécharge une URL (ex. document vu dans Playwright) vers
  `downloads/`, confirmation pour l'écrasement ou les gros fichiers.
- Drive est branché sur le même OAuth que Gmail/Calendar
  (scope supplémentaire `drive.readonly` — voir re-autorisation ci-dessous).
- Config : `data/files-config.json` (`root`, `sourcePriority`), surchargée
  par `NEXUS_FILES_ROOT`. Env préfixé : `NEXUS_FILES_CONFIG`.
- CLI : `/files` (statut), `/files root <chemin>`, `/files priority <local|drive>`,
  `/files pending` (fichiers en attente d'envoi).

### Re-autorisation Google pour le scope Drive

Le scope `drive.readonly` a été ajouté après votre autorisation initiale
Gmail/Calendrier : un token déjà généré ne couvrant pas ce scope doit être
régénéré.

```bash
rm credentials/google-token.json
# au prochain appel Drive (ou /files), NEXUS demande l'autorisation Drive
```

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

### Memory V1 ✅ (Obsidian vault)

La mémoire longue est un **vault Obsidian** : des fichiers Markdown
avec frontmatter YAML, lisibles et éditables directement dans Obsidian
(graph, backlinks, tags). Aucun plugin ni service externe.

Emplacement (configurable via `NEXUS_VAULT`) :

```text
memories/
```

Fichiers :

```text
src/memory/brain.js      # API: remember / recall / update / forget / list / stats + projet + relations
src/memory/notes.js      # gestion des notes .md + frontmatter (+ champs projet, relations)
src/memory/state.js      # état persistant (projet actif)
src/tools/memory.js      # outils modèles: memory_add / search / list / update / forget
src/tools/project.js     # outils projets: project_init / set / checkpoint / log / status / resume / list
```

Types de mémoires :

```text
fact
decision
preference
event
note
project      (souche du projet, frontmatter état courant)
checkpoint   (bilan chaîné dans le temps)
project
```

Nom des fichiers (style « second brain ») :

```text
<date>-<titre-court-significatif>.md      ex. 2026-09-10-utilise-nas-synology.md
projets/<projet>.md                       ex. projets/nexus.md  (souche du projet)
```

Note type: `importance` (0.0–1.0) + `confidence` (0–1) rangent les résultats
du rappel (le plus pertinent d'abord). Chaque note porte un `id` stable en
frontmatter (le nom de fichier reste donc libre d'être renommé).

Example memory (fichier `memories/*.md`) :

```markdown
---
id: 2026-09-xxx
title: Utilise un NAS Synology
type: decision
project: nexus
importance: 0.9
confidence: 1
tags: nas, architecture
created: 2026-09-10T...
updated: 2026-09-10T...
---

Gemini reste le routeur principal.

**Connexions :**
- [[projets/nexus]]
- ↑ [[2026-09-09-echange-precedent]]
```

Connexions dans le graphe Obsidian :

- chaque note liée à un projet pointe sa **souche** `[[projets/nexus]]`
  (le graphe forme un hub + rayons) ;
- les échanges (`event`) sont **chaînés** : chaque note pointe la précédente
  (`↑ [[...]]`) pour former une timeline ;
- vue Graphe dans Obsidian (`Cmd+G`) après avoir ouvert `memories/`
  comme vault.

Intégration :

- **mémorisation sélective** : les échanges ne sont PAS archivés
  automatiquement. NEXUS ne retient que ce qui a de la valeur (faits,
  préférences, décisions, projets, agenda). Une note avec `projectId`
  ne crée JAMAIS de souche projet : `project_init` est le seul moyen ;
- **projet actif** : le rappel automatique est filtré par le projet actif
  (`/project <nom>`, persisté dans `data/nexus-state.json`), avec repli
  sur la mémoire globale si le projet ne fournit rien ;
- rappel : les notes pertinentes (mots-clés du message) sont injectées
  en tête du message utilisateur de chaque demande (jamais dans
  `systemInstruction`) ;
- **CLI** : `/memory search|get|list|forget|count` pour l'utilisateur,
  et `/status` affiche le nombre de notes et leur répartition par type ;
- outils disponibles sur **toutes** les routes (DIRECT, CALENDAR, GMAIL,
  NAS... : NEXUS peut donc retenir une information pendant n'importe
  quelle tâche, ex. un agenda ajouté au calendrier) :
  `memory_add`, `memory_search`, `memory_list`,
  `memory_update`, `memory_forget`.
- état du second cerveau : `data/nexus-state.json` (projet actif).
- **liens entre notes** : à la création, NEXUS relie automatiquement la
  note aux notes déjà liées par le sujet (mots-clés rares pondérés IDF +
  tags + même projet) — lien `↔` dans `**Connexions :**` et backlink sur
  les notes cibles. `/memory relink` reconstruit les liens sur tout le vault.
- **recherche élargie** : `recallMemories` normalise les accents et élargit
  les termes de recherche via une table de synonymes légères (ex. « étude »
  ↔ étudiant, université, école…). En l'absence de match, NEXUS remonte
  les notes les plus importantes (core memories). Les résultats de
  `memory_search` et `memory_list` restent compacts.

### Project Copilot Core V1 ✅

Couche projet superposée à la mémoire longue : chaque projet vit
comme une **souche** `projets/<slug>.md` (type `project`) dans le
vault, avec l'état courant dans le frontmatter (status, goal,
milestones, nextAction, lastCheckpoint). Un **index** `projets/_index.md`
généré automatiquement liste tous les projets (exclu du scan modèle).

Outils (route NATIVE) :

| Outil | Rôle |
|---|---|
| `project_init` | crée la souche + index |
| `project_set` | met à jour le frontmatter (status, goal, milestones, nextAction) |
| `project_checkpoint` | écrit un bilan chaîné (type `checkpoint`, parent) + met à jour hub |
| `project_log` | journalise une activité ou décision liée au projet |
| `project_status` | état courant + derniers logs |
| `project_resume` | project_resume enrichi : à appeler quand l'utilisateur dit « on reprend X » |
| `project_list` | liste tous les projets (nom, statut, prochaine action) |

CLI :

```text
/project <nom>     Initialise / affiche l'état d'un projet
/project delete X  Supprime le projet (ses notes deviennent de la mémoire générale)
/projects          Liste de tous les projets
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

## Budget tokens & contexte

Mesures réelles (estimation ~4 chars/token, `gemini-3.5-flash-lite`) :

| Composant par requête | Coût | Type |
|---|---|---|
| `systemPrompt` | ~1 000 tokens | fixe |
| Déclarations d'outils (route NATIVE, ~58 outils) | ~5 800 tokens | fixe (dont ~700 tokens mémoire sur toutes routes + ~600 tokens projet NATIVE + ~250 tokens Files NATIVE) |
| Rappel mémoire (≤3 extraits, ~160 chars) | ~50–150 tokens | borné |
| Historique court terme (12 messages) | ~2 500+ tokens | variable, croît |
| Résultats complets de `memory_search` | jusqu'à ~5 000 tokens (avant) | compacté depuis |

Principes appliqués :

1. **La mémoire ne va PAS dans `systemInstruction`.** Le rappel est préfixé
   au message utilisateur → le préfixe statique (prompt système + outils +
   historique) reste identique entre requêtes et peut être **mis en cache**
   par Gemini (économie majeure sur la partie fixe ~5.8k tokens).
2. **`memory_search` / `memory_list` sont compactés** : ils renvoient
   `id, title, type, importance, extrait (~150 chars)` au lieu du contenu
   complet → supprime les pics de tokens liés à la mémoire.
3. **Instrumentation** : chaque réponse expose `usageMetadata`
   (`promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`),
   agrégé par la CLI sous forme de ligne `[TOKENS] entrée · sortie · cache`.

Le gros levier restant est l'historique court terme : il grandit avec la
conversation. Piste : résumer/soumettre les vieux échanges ou borner la
taille des contenus d'outils stockés.

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
/memory   Mémoire longue (search / get / list / forget / count)
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

NEXUS_VAULT=                       # facultatif: chemin du vault Obsidian (défaut: ./memories)

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
Local read   → root configurée seulement (~/Documents par défaut)
Local write  → root configurée, écrasement avec confirmation
Download     → root configurée + confirmation (écrasement/gros fichier)
Drive read   → scope drive.readonly (lecture seule)
Delete       → confirmation
```

### Credentials

Never commit:

```text
.env
credentials/
memories/
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
✅ TERMINÉ

1. ✅ Gmail V1 (read, draft, send with confirmation)
2. ✅ Google Calendar V1
3. ✅ Tuya home automation
4. ✅ NAS (Wake on LAN, auth, folder listing)
5. ✅ Memory Brain V1 (notes Obsidian)
   - remember / recall / update / forget
   - types: fact, decision, preference, event, note, project, checkpoint
   - importance + confidence ranking
   - rappel automatique (projet actif + core memories)
   - liens ↔ entre notes liées + /memory relink
   - recherche élargie (accents + synonymes)
6. ✅ Project Copilot Core
   - registry • active project • goals + milestones • checkpoints
   - resume • next action • activity log • decision log
7. ✅ Compact CLI (command suggestions, file attach, custom input)
8. ✅ Files V1 — accès local + Google Drive (priorité configurable)
   - file_search : recherche unifiée locale + Drive avec repli automatique
   - file_list / file_read : navigation + lecture texte / binaire / images+PDF
   - file_write / file_mkdir : création fichiers + dossiers (confirmation écrasement)
   - file_download : téléchargement d'URL (navigateur / Playwright) avec confirmation
   - route FILES (router), disponible aussi sur NATIVE/BROWSER
   - configuration : racine locale, priorité local / drive, CLI /files

À VENIR

9. Google Tasks
10. Voice Overlay (reactive orb • STT • TTS • ambient UI)
11. Context Copilot
12. Deep VS Code integration
13. Location and personal places
14. Intelligent error handling
15. Persistent NEXUS Core service
16. Full Workspace / HUD
17. Proactivity
18. Memory Brain V2
19. Advanced local AI
20. Vault / Knowledge Base
```

Near-term order:

```text
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
Memory Brain V1 (notes Obsidian)
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
