import path from "node:path";
import fs from "node:fs/promises";

import blessed from "blessed";
import {
  startNexus,
  askNexus,
} from "../agent/nexus.js";
import {
  getActiveProject,
  setActiveProject,
} from "../memory/state.js";
import {
  recallMemories,
  listMemories,
  forgetMemory,
  memoryStats,
  getMemory,
  initProject,
  projectResume,
  listProjects,
  removeProject,
  relinkMemories,
} from "../memory/brain.js";
import {
  getFilesSettings,
  setFilesRoot,
  setFilesPriority,
  setFilesDownloadDir,
} from "../services/files/settings.js";
import {
  listPlaces,
  savePlace,
  removePlace,
} from "../services/location/store.js";
import {
  geocode,
} from "../services/location/geo.js";

// ============================================================
// FILES
// ============================================================

const MIME_BY_EXT = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".mjs": "text/javascript",
  ".cjs": "text/javascript",
  ".py": "text/x-python",
  ".html": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".xml": "text/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".svg": "text/plain",
  ".log": "text/plain",
};

const MAX_FILE_SIZE_BYTES = 19 * 1024 * 1024;

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return MIME_BY_EXT[ext] ?? "text/plain";
}

function truncate(text, max) {
  const value = String(text ?? "");

  return value.length > max
    ? `${value.slice(0, max - 1)}…`
    : value;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

async function readFileAsAttachment(filePath) {
  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error(`${filePath} n'est pas un fichier.`);
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `${path.basename(filePath)} dépasse la limite de ${formatBytes(MAX_FILE_SIZE_BYTES)}.`
    );
  }

  const data = await fs.readFile(filePath);
  const base64 = data.toString("base64");

  return {
    name: path.basename(filePath),
    mimeType: detectMimeType(filePath),
    data: base64,
    size: stat.size,
  };
}

const pendingFiles = [];

// ============================================================
// NEXUS CLI
// ============================================================

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: "NEXUS CLI",
});

// Curseur "terminal" : un bloc clignotant dessiné par blessed à
// la position d'insertion, comme le curseur d'un shell.
screen.cursor.artificial = true;
screen.cursorShape("block", true);
screen.cursor._state = 1;


// ============================================================
// THEME
// ============================================================

// "default" = utilise directement le background du terminal.
const COLORS = {
  bg: "default",
  cyan: "#38d9ff",
  cyanBright: "#7cecff",
  blue: "#458cff",
  white: "#f2f5f7",
  muted: "#62727e",
  border: "#182832",
  borderActive: "#305463",
  user: "#e8edf0",
  nexus: "#38d9ff",
  tool: "#658cff",
  error: "#ff6b6b",
};


// ============================================================
// STATE
// ============================================================

const nexusState = {
  status: "IDLE",
  project: "NEXUS",
  routerModel: "Gemini",
  responseModel: "Gemini",
  route: "DIRECT",
  tool: "—",
};

let orbMode = "IDLE";
let orbTime = 0;
let orbAnimation;


// ============================================================
// UI HELPERS
// ============================================================

const terminalStyle = {
  bg: COLORS.bg,
};

function box(options = {}) {
  return blessed.box({
    tags: true,
    style: terminalStyle,
    ...options,
    style: {
      ...terminalStyle,
      ...(options.style ?? {}),
    },
  });
}


// ============================================================
// ROOT
// ============================================================

const root = box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
});


// ============================================================
// LEFT — NEXUS CORE
// ============================================================

const orbPanel = box({
  parent: root,
  top: 0,
  left: 0,
  width: "34%",
  height: "100%-5",
  border: { type: "line" },
  style: {
    border: { fg: COLORS.border },
  },
});

const title = box({
  parent: orbPanel,
  top: 0,
  left: 0,
  width: "100%",
  height: 2,
  align: "center",
  content:
    `{${COLORS.white}-fg}N   E   X   U   S{/}\n` +
    `{${COLORS.muted}-fg}NEURAL CORE{/}`,
});

const orbBox = box({
  parent: orbPanel,
  top: 3,
  left: "center",
  width: "100%-4",
  height: 18,
  align: "center",
  valign: "middle",
});

// Une seule zone responsive sous l'orb.
const coreInfo = box({
  parent: orbPanel,
  left: 2,
  width: "100%-4",
  bottom: 1,
  height: 10,
  align: "left",
});


// ============================================================
// RIGHT — CONVERSATION
// ============================================================

const conversationPanel = box({
  parent: root,
  top: 0,
  left: "34%-1",
  width: "66%+1",
  height: "100%-5",
  border: { type: "line" },
  label: " CONVERSATION ",

  scrollable: true,
  alwaysScroll: true,
  // Les touches ↑/↓ sont réservées à la saisie et au menu de
  // commandes ; le défilement se fait à la molette.
  keys: false,
  mouse: true,

  scrollbar: {
    ch: "│",
    style: {
      fg: COLORS.cyan,
      bg: COLORS.bg,
    },
  },

  style: {
    fg: COLORS.white,
    border: { fg: COLORS.border },
    label: {
      fg: COLORS.muted,
      bg: COLORS.bg,
    },
  },
});



// ============================================================
// INPUT  (édition gérée par nous-mêmes : curseur ←/→, clic OK)
// ============================================================

const inputPanel = box({
  parent: root,
  bottom: 0,
  left: 0,
  width: "100%",
  height: 5,
  border: { type: "line" },
  style: {
    border: { fg: COLORS.borderActive },
  },
});

blessed.text({
  parent: inputPanel,
  top: 1,
  left: 2,
  width: 3,
  height: 1,
  tags: true,
  content: `{${COLORS.cyan}-fg}>{/}`,
  style: terminalStyle,
});

// Affichage du texte tapé. On gère nous-mêmes la frappe, le
// curseur (←/→), la sélection de commande et le clic souris :
// plus de dépendance au focus/readInput de blessé.
const inputDisplay = box({
  parent: inputPanel,
  top: 0,
  left: 5,
  width: "100%-7",
  height: 3,
  valign: "middle",
  wrap: false,
  padding: 0,
});

let lineValue = "";
let caret = 0;
let inputIsReading = true;

function getInputValue() {
  return lineValue;
}

function setInputValue(value) {
  lineValue = String(value ?? "");
  caret = lineValue.length;
  renderInput();
}

function clearInput() {
  setInputValue("");
}

function renderInput() {
  const rawWidth = inputDisplay.width;
  const width =
    typeof rawWidth === "number" && rawWidth > 4
      ? rawWidth - 2
      : Math.max(4, screen.width - 10);

  // Fenêtre de texte : le curseur reste toujours visible.
  let start = 0;
  if (caret > width - 1) {
    start = caret - (width - 1);
  }

  const before =
    lineValue.slice(start, caret);
  const after =
    lineValue.slice(caret, start + width);

  inputDisplay.setContent(before + after);

  // Curseur "terminal" : bloc clignotant dessiné par blessed à la
  // position d'insertion (après le dernier caractère), comme dans
  // un shell. On force le réaffichage du bloc (il peut être mis en
  // pause par blessed au boot) et on le place sur la ligne qui
  // affiche le texte saisi.
  screen.cursor._hidden = false;
  screen.program.cursorPos(
    inputDisplay.atop + 1,
    inputDisplay.aleft + (caret - start) + 1
  );

  screen.render();
}

function activateInput() {
  inputIsReading = true;
  renderInput();
}

// Toute la saisie est interceptée au niveau de l'écran (avant
// que les éléments ne la consomment). Le clic d'une zone ne
// met donc plus fin à la saisie.
screen.on("keypress", (ch, key) => {
  if (!inputIsReading) return;

  const k = key.name;

  // ----- Navigation de commande (menu /) -------------------
  if (k === "up") {
    if (suggestionState.visible) moveSuggestion(-1);
    return;
  }

  if (k === "down") {
    if (suggestionState.visible) moveSuggestion(1);
    return;
  }

  if (k === "tab") {
    if (suggestionState.visible) {
      acceptSuggestion(false);
    }
    return;
  }

  if (k === "escape") {
    if (suggestionState.visible) {
      hideSuggestions();
    } else {
      shutdown();
    }
    return;
  }

  // ----- Soumission ----------------------------------------
  // "return" est ré-émis en "enter" par blessé : on ignore
  // "return" pour éviter une double soumission.
  if (k === "enter" || k === "linefeed") {
    handleSubmit(getInputValue());
    return;
  }

  if (k === "return") return;

  // ----- Curseur ←/→ Home/End ------------------------------
  if (k === "left") {
    if (caret > 0) {
      caret--;
      renderInput();
    }
    return;
  }

  if (k === "right") {
    if (caret < lineValue.length) {
      caret++;
      renderInput();
    }
    return;
  }

  if (k === "home") {
    caret = 0;
    renderInput();
    return;
  }

  if (k === "end") {
    caret = lineValue.length;
    renderInput();
    return;
  }

  // ----- Édition --------------------------------------------
  if (k === "backspace") {
    if (caret > 0) {
      const at = lineValue.slice(0, caret - 1);
      const rest = lineValue.slice(caret);
      lineValue = at + rest;
      caret--;
      renderInput();
      refreshSuggestions();
    }
    return;
  }

  if (k === "delete") {
    if (caret < lineValue.length) {
      lineValue =
        lineValue.slice(0, caret) +
        lineValue.slice(caret + 1);
      renderInput();
      refreshSuggestions();
    }
    return;
  }

  // ----- Caractères imprimables ------------------------------
  if (
    ch &&
    !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)
  ) {
    lineValue =
      lineValue.slice(0, caret) +
      ch +
      lineValue.slice(caret);
    caret++;
    renderInput();
    refreshSuggestions();
  }
});


// ============================================================
// COMMAND SUGGESTIONS  (/menu au-dessus de l'entrée)
// ============================================================

const COMMANDS = [
  { name: "/help",    desc: "Afficher l'aide des commandes" },
  { name: "/status",  desc: "État de NEXUS" },
  { name: "/attach",  desc: "Ajouter des fichiers (chemins)" },
  { name: "/files",   desc: "Fichiers : statut / root / priority / downloaddir / pending" },
  { name: "/detach",  desc: "Retirer un fichier (index, nom ou all)" },
  { name: "/project", desc: "Projet actif (état / initialise)" },
  { name: "/projects", desc: "Liste des projets" },
  { name: "/memory",  desc: "Mémoire longue (search/get/list/forget/count)" },
  { name: "/places",  desc: "Lieux personnels (list/add/remove)" },
  { name: "/model",   desc: "Changer de modèle (nom)" },
  { name: "/tools",   desc: "Outils disponibles" },
  { name: "/clear",   desc: "Effacer la conversation" },
  { name: "/exit",    desc: "Quitter NEXUS" },
];

const suggestionState = {
  visible: false,
  matches: [],
  matchesKey: "",
  selected: 0,
  offset: 0,
};

const MAX_SUGGESTIONS = 10;

const suggestionsBox = box({
  parent: root,
  bottom: 5,
  left: 0,
  width: "66%",
  height: 1,
  hidden: true,
  border: { type: "line" },
  style: {
    border: { fg: COLORS.borderActive },
    bg: COLORS.bg,
    fg: COLORS.white,
  },
});

function hideSuggestions() {
  if (!suggestionState.visible) return;

  suggestionState.visible = false;
  suggestionState.matches = [];
  suggestionState.matchesKey = "";
  suggestionState.selected = 0;
  suggestionState.offset = 0;

  suggestionsBox.hide();
  screen.render();
}

function renderSuggestions() {
  const { matches, selected } = suggestionState;
  const start = suggestionState.offset;

  const boxWidth =
    Math.floor(screen.width * 0.66);

  const rows = matches
    .slice(start, start + MAX_SUGGESTIONS)
    .map((name, i) => {
      const index = start + i;
      const active = index === selected;
      const cmd = COMMANDS.find(
        c => c.name === name
      );
      const desc = cmd?.desc ?? "";

      const nameWidth = name.length;
      const maxDesc =
        Math.max(8, boxWidth - nameWidth - 8);
      const descClipped =
        desc.length > maxDesc
          ? desc.slice(0, maxDesc - 1) + "…"
          : desc;

      if (active) {
        return (
          `{${COLORS.cyan}-fg}› ${name}{/}` +
          `{${COLORS.white}-fg} ${descClipped}{/}`
        );
      }

      return (
        `  ${name}` +
        `{${COLORS.muted}-fg} ${descClipped}{/}`
      );
    });

  suggestionsBox.height = rows.length + 2;
  suggestionsBox.setContent(rows.join("\n"));
  suggestionsBox.show();
  screen.render();
}

function moveSuggestion(delta) {
  if (!suggestionState.visible) return;

  const total = suggestionState.matches.length;
  if (!total) return;

  let next = suggestionState.selected + delta;

  if (next < 0) next = total - 1;
  if (next >= total) next = 0;

  suggestionState.selected = next;

  // Garde la sélection visible dans la fenêtre.
  if (next < suggestionState.offset) {
    suggestionState.offset = next;
  } else if (next >= suggestionState.offset + MAX_SUGGESTIONS) {
    suggestionState.offset =
      next - MAX_SUGGESTIONS + 1;
  }

  renderSuggestions();
}

function refreshSuggestions() {
  const value = getInputValue();

  const isCommandContext =
    value.startsWith("/") &&
    !value.includes(" ");

  if (!isCommandContext) {
    hideSuggestions();
    return;
  }

  const query = value.toLowerCase();

  const matches = COMMANDS
    .filter(cmd => cmd.name.startsWith(query))
    .map(cmd => cmd.name);

  if (!matches.length) {
    hideSuggestions();
    return;
  }

  // Commande complète tapée → on ferme le menu (l'Entrée
  // exécute directement la commande, pas besoin du menu).
  const exactMatch =
    matches.length === 1 &&
    matches[0] === value;

  if (exactMatch) {
    hideSuggestions();
    return;
  }

  const wasVisible = suggestionState.visible;
  const matchesKey = matches.join(",");
  const matchesChanged =
    matchesKey !== suggestionState.matchesKey;

  suggestionState.visible = true;
  suggestionState.matches = matches;
  suggestionState.matchesKey = matchesKey;

  if (
    !wasVisible ||
    matchesChanged ||
    suggestionState.selected >= matches.length
  ) {
    suggestionState.selected = 0;
    suggestionState.offset = 0;
  }

  renderSuggestions();
}

function acceptSuggestion(withSubmit) {
  if (!suggestionState.visible) return;

  const { matches, selected } = suggestionState;
  if (!matches.length) return;

  const command = matches[selected];

  if (withSubmit) {
    clearInput();
    hideSuggestions();
    handleSubmit(command);
    return;
  }

  // Tab : complète la commande dans l'entrée, on continue d'éditer.
  setInputValue(command);
  hideSuggestions();
} 

// La navigation ↑/↓, Tab et l'édition sont gérées dans le
// handler global "screen.on('keypress')" (section INPUT).


// ============================================================
// BRAILLE ORB
// ============================================================

let CHAR_WIDTH = 34;
let CHAR_HEIGHT = 16;

let PIXEL_WIDTH;
let PIXEL_HEIGHT;
let CENTER_X;
let CENTER_Y;
let RADIUS;

const BRAILLE_MAP = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

let liveToolLine = null;
let liveToolStatusLine = null;


// ============================================================
// RESPONSIVE LAYOUT
// ============================================================

function getLayoutMode() {
  const width = screen.width;
  const height = screen.height;

  if (height <= 28 || width <= 95) return "TINY";
  if (height <= 36 || width <= 120) return "COMPACT";
  if (height <= 45 || width <= 150) return "MEDIUM";

  return "FULL";
}

function updateLayout() {
  const mode = getLayoutMode();

  switch (mode) {
    case "TINY":
      orbPanel.width = "31%";
      conversationPanel.left = "31%-1";
      conversationPanel.width = "69%+1";

      title.height = 1;
      title.setContent(`{${COLORS.white}-fg}N E X U S{/}`);

      orbBox.top = 1;
      orbBox.height = 11;

      coreInfo.height = 6;

      CHAR_WIDTH = 22;
      CHAR_HEIGHT = 8;
      break;

    case "COMPACT":
      orbPanel.width = "32%";
      conversationPanel.left = "32%-1";
      conversationPanel.width = "68%+1";

      title.height = 2;
      title.setContent(
        `{${COLORS.white}-fg}N E X U S{/}\n` +
        `{${COLORS.muted}-fg}NEURAL CORE{/}`
      );

      orbBox.top = 2;
      orbBox.height = 14;

      coreInfo.height = 7;

      CHAR_WIDTH = 26;
      CHAR_HEIGHT = 10;
      break;

    case "MEDIUM":
      orbPanel.width = "34%";
      conversationPanel.left = "34%-1";
      conversationPanel.width = "66%+1";

      title.height = 2;
      title.setContent(
        `{${COLORS.white}-fg}N   E   X   U   S{/}\n` +
        `{${COLORS.muted}-fg}NEURAL CORE{/}`
      );

      orbBox.top = 2;
      orbBox.height = 17;

      coreInfo.height = 9;

      CHAR_WIDTH = 30;
      CHAR_HEIGHT = 12;
      break;

    default:
      orbPanel.width = "34%";
      conversationPanel.left = "34%-1";
      conversationPanel.width = "66%+1";

      title.height = 2;
      title.setContent(
        `{${COLORS.white}-fg}N   E   X   U   S{/}\n` +
        `{${COLORS.muted}-fg}NEURAL CORE{/}`
      );

      orbBox.top = 3;
      orbBox.height = 20;

      coreInfo.height = 11;

      CHAR_WIDTH = 34;
      CHAR_HEIGHT = 16;
  }

  updateOrbDimensions();
  renderCoreInfo();
}

function updateOrbDimensions() {
  PIXEL_WIDTH = CHAR_WIDTH * 2;
  PIXEL_HEIGHT = CHAR_HEIGHT * 4;

  CENTER_X = PIXEL_WIDTH / 2;
  CENTER_Y = PIXEL_HEIGHT / 2;

  RADIUS = Math.min(
    PIXEL_WIDTH * 0.4,
    PIXEL_HEIGHT * 0.4
  );
}


// ============================================================
// RESPONSIVE CORE INFORMATION
// ============================================================

function getStatusDisplay() {
  switch (orbMode) {
    case "THINKING":
      return {
        icon: "◌",
        text: "THINKING",
        color: COLORS.cyanBright,
        activity: "Processing...",
      };

    case "TOOL":
      return {
        icon: "◎",
        text: nexusState.tool || "TOOL",
        color: COLORS.tool,
        activity: "Executing...",
      };

    case "SPEAKING":
      return {
        icon: "◉",
        text: "SPEAKING",
        color: COLORS.cyanBright,
        activity: "Generating...",
      };

    case "ERROR":
      return {
        icon: "!",
        text: "ERROR",
        color: COLORS.error,
        activity: "Something went wrong",
      };

    default:
      return {
        icon: "●",
        text: "CORE ONLINE",
        color: COLORS.cyan,
        activity: "Ready",
      };
  }
}

function renderCoreInfo() {
  const mode = getLayoutMode();
  const status = getStatusDisplay();

  const statusLine =
    `{${status.color}-fg}${status.icon} ${status.text}{/}`;

  const activity =
    `{${COLORS.muted}-fg}${status.activity}{/}`;

  if (mode === "TINY") {
    coreInfo.setContent(
      `${statusLine}\n` +
      `${activity}\n\n` +
      `{${COLORS.cyan}-fg}${nexusState.route}{/} · ` +
      `{${COLORS.tool}-fg}${nexusState.tool}{/}`
    );

    return;
  }

  if (mode === "COMPACT") {
    coreInfo.setContent(
      `${statusLine}\n` +
      `${activity}\n\n` +
      `{${COLORS.muted}-fg}ROUTE{/} ` +
      `{${COLORS.cyan}-fg}${nexusState.route}{/}\n` +
      `{${COLORS.muted}-fg}TOOL {/} ` +
      `{${COLORS.tool}-fg}${nexusState.tool}{/}`
    );

    return;
  }

  if (mode === "MEDIUM") {
    coreInfo.setContent(
      `${statusLine}\n` +
      `${activity}\n\n` +
      `{${COLORS.muted}-fg}PROJECT{/} ` +
      `{${COLORS.white}-fg}${nexusState.project}{/}\n` +
      `{${COLORS.muted}-fg}ROUTER {/} ` +
      `{${COLORS.white}-fg}${nexusState.routerModel}{/}\n` +
      `{${COLORS.muted}-fg}ROUTE  {/} ` +
      `{${COLORS.cyan}-fg}${nexusState.route}{/}\n` +
      `{${COLORS.muted}-fg}TOOL   {/} ` +
      `{${COLORS.tool}-fg}${nexusState.tool}{/}`
    );

    return;
  }

  coreInfo.setContent(
    `${statusLine}\n` +
    `${activity}\n\n` +

    `{${COLORS.muted}-fg}PROJECT{/}  ` +
    `{${COLORS.white}-fg}${nexusState.project}{/}\n` +

    `{${COLORS.muted}-fg}ROUTER {/}  ` +
    `{${COLORS.white}-fg}${nexusState.routerModel}{/}\n` +

    `{${COLORS.muted}-fg}MODEL  {/}  ` +
    `{${COLORS.white}-fg}${nexusState.responseModel}{/}\n` +

    `{${COLORS.muted}-fg}ROUTE  {/}  ` +
    `{${COLORS.cyan}-fg}${nexusState.route}{/}\n` +

    `{${COLORS.muted}-fg}TOOL   {/}  ` +
    `{${COLORS.tool}-fg}${nexusState.tool}{/}\n\n` +

    `{${COLORS.muted}-fg}MÉMOIRE{/} ` +
    `{${COLORS.white}-fg}${memoryStats().total} notes{/}\n\n` +

    `{${COLORS.muted}-fg}/help · ESC quitter{/}`
  );
}


// ============================================================
// CANVAS
// ============================================================

function createCanvas() {
  return Array.from(
    { length: PIXEL_HEIGHT },
    () => new Uint8Array(PIXEL_WIDTH)
  );
}

function setPixel(canvas, x, y) {
  x = Math.round(x);
  y = Math.round(y);

  if (
    x >= 0 &&
    x < PIXEL_WIDTH &&
    y >= 0 &&
    y < PIXEL_HEIGHT
  ) {
    canvas[y][x] = 1;
  }
}

function drawLine(canvas, x0, y0, x1, y1, density = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;

  const steps = Math.ceil(
    Math.max(Math.abs(dx), Math.abs(dy))
  );

  if (!steps) return;

  for (let i = 0; i <= steps; i++) {
    if (density < 1 && Math.random() > density) continue;

    const t = i / steps;

    setPixel(
      canvas,
      x0 + dx * t,
      y0 + dy * t
    );
  }
}

function drawCircle(canvas, cx, cy, radius, density = 1) {
  const steps = Math.max(1, Math.floor(radius * 15));

  for (let i = 0; i < steps; i++) {
    if (density < 1 && Math.random() > density) continue;

    const angle =
      (i / steps) *
      Math.PI *
      2;

    setPixel(
      canvas,
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius
    );
  }
}

function drawNode(canvas, x, y, size = 1) {
  setPixel(canvas, x, y);

  if (size >= 2) {
    setPixel(canvas, x + 1, y);
    setPixel(canvas, x - 1, y);
    setPixel(canvas, x, y + 1);
    setPixel(canvas, x, y - 1);
  }

  if (size >= 3) {
    setPixel(canvas, x + 2, y);
    setPixel(canvas, x - 2, y);
    setPixel(canvas, x, y + 2);
    setPixel(canvas, x, y - 2);
  }
}


// ============================================================
// SPHERE
// ============================================================

const NODE_COUNT = 38;
const nodes = [];

function randomSpherePoint() {
  const theta = Math.random() * Math.PI * 2;
  const y = Math.random() * 2 - 1;
  const radius = Math.sqrt(1 - y * y);

  return {
    x: radius * Math.cos(theta),
    y,
    z: radius * Math.sin(theta),
  };
}

for (let i = 0; i < NODE_COUNT; i++) {
  nodes.push(randomSpherePoint());
}

function rotateY(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x * cos - point.z * sin,
    y: point.y,
    z: point.x * sin + point.z * cos,
  };
}

function rotateX(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

function project(point) {
  const perspective =
    1 + point.z * 0.1;

  return {
    x:
      CENTER_X +
      point.x *
        RADIUS *
        perspective,

    y:
      CENTER_Y +
      point.y *
        RADIUS *
        perspective,

    z: point.z,
  };
}


// ============================================================
// BRAILLE ENCODER
// ============================================================

function canvasToBraille(canvas) {
  let output = "";

  for (let charY = 0; charY < CHAR_HEIGHT; charY++) {
    for (let charX = 0; charX < CHAR_WIDTH; charX++) {
      let code = 0;

      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 2; px++) {
          const x = charX * 2 + px;
          const y = charY * 4 + py;

          if (canvas[y]?.[x]) {
            code |= BRAILLE_MAP[py][px];
          }
        }
      }

      output +=
        code === 0
          ? " "
          : String.fromCharCode(0x2800 + code);
    }

    if (charY < CHAR_HEIGHT - 1) {
      output += "\n";
    }
  }

  return output;
}


// ============================================================
// ORB STATE
// ============================================================

function setOrbMode(mode, toolName = null) {
  orbMode = mode;
  nexusState.status = mode;

  if (mode === "TOOL" && toolName) {
    nexusState.tool = toolName;
  }

  renderCoreInfo();
  screen.render();
}

function setRoute(route) {
  nexusState.route = route;
  renderCoreInfo();
}

function setTool(tool = "—") {
  nexusState.tool = tool;
  renderCoreInfo();
}


// ============================================================
// ORB SETTINGS
// ============================================================

function getOrbSettings() {
  if (orbMode === "THINKING") {
    return {
      speed: 0.02,
      distance: 0.68,
      color: COLORS.cyanBright,
    };
  }

  if (orbMode === "TOOL") {
    return {
      speed: 0.014,
      distance: 0.58,
      color: COLORS.blue,
    };
  }

  if (orbMode === "SPEAKING") {
    return {
      speed: 0.011,
      distance: 0.62,
      color: COLORS.cyanBright,
    };
  }

  return {
    speed: 0.006,
    distance: 0.56,
    color: COLORS.cyan,
  };
}


// ============================================================
// ORB RENDER
// ============================================================

function renderOrb() {
  const settings = getOrbSettings();
  const canvas = createCanvas();

  drawCircle(canvas, CENTER_X, CENTER_Y, RADIUS, 0.92);
  drawCircle(canvas, CENTER_X, CENTER_Y, RADIUS * 0.94, 0.12);

  const angleY = orbTime * settings.speed;
  const angleX =
    Math.sin(orbTime * 0.008) *
    0.18;

  const transformed = nodes.map(node => {
    let point = rotateY(node, angleY);
    point = rotateX(point, angleX);

    return project(point);
  });

  // Connections
  for (let i = 0; i < transformed.length; i++) {
    for (let j = i + 1; j < transformed.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      const distance = Math.sqrt(
        (a.x - b.x) ** 2 +
        (a.y - b.y) ** 2 +
        (a.z - b.z) ** 2
      );

      if (distance > settings.distance) continue;

      const pa = transformed[i];
      const pb = transformed[j];

      drawLine(
        canvas,
        pa.x,
        pa.y,
        pb.x,
        pb.y,
        (pa.z + pb.z) / 2 > 0
          ? 0.75
          : 0.2
      );
    }
  }

  // Nodes
  for (const node of transformed) {
    const size =
      node.z > 0.72
        ? 3
        : node.z > 0.25
          ? 2
          : 1;

    drawNode(
      canvas,
      node.x,
      node.y,
      size
    );
  }

  // Core
  const pulseSpeed =
    orbMode === "SPEAKING"
      ? 0.2
      : orbMode === "THINKING"
        ? 0.15
        : orbMode === "TOOL"
          ? 0.12
          : 0.08;

  const pulse =
    (Math.sin(orbTime * pulseSpeed) + 1) / 2;

  drawCircle(
    canvas,
    CENTER_X,
    CENTER_Y,
    2.5 + pulse * 2,
    1
  );

  drawNode(
    canvas,
    CENTER_X,
    CENTER_Y,
    3
  );

  orbBox.setContent(
    `{${settings.color}-fg}${canvasToBraille(canvas)}{/}`
  );

  orbTime++;
  screen.render();
}


// ============================================================
// CONVERSATION
// ============================================================

function pushConversation(line = "") {
  conversationPanel.pushLine(line);
  conversationPanel.setScrollPerc(100);
  screen.render();
}

function addUserMessage(message, files = []) {
  pushConversation("");
  pushConversation(
    `{${COLORS.muted}-fg}TOI{/}`
  );

  if (message) {
    pushConversation(
      `{${COLORS.user}-fg}${message}{/}`
    );
  }

  for (const file of files) {
    pushConversation(
      `{${COLORS.muted}-fg}[FICHIER]{/} ` +
      `{${COLORS.cyan}-fg}${file.name}{/} ` +
      `{${COLORS.muted}-fg}(${file.mimeType} · ${formatBytes(file.size)}){/}`
    );
  }

  prepareToolActivity();
}

function addNexusMessage(message) {
  pushConversation("");
  pushConversation(`{${COLORS.nexus}-fg}NEXUS{/}`);

  for (const line of String(message).split("\n")) {
    pushConversation(`{${COLORS.white}-fg}${line}{/}`);
  }
}

function showUsage(usage = {}) {
  const parts = [];

  parts.push(
    `entrée ${usage.promptTokenCount ?? 0}`
  );
  parts.push(
    `sortie ${usage.candidatesTokenCount ?? 0}`
  );

  const cached =
    usage.cachedContentTokenCount ?? 0;

  if (cached > 0) {
    parts.push(`cache ${cached}`);
  }

  pushConversation(
    `{${COLORS.muted}-fg}[TOKENS] ${parts.join(" · ")}{/}`
  );
}

// ============================================================
// COMMANDS
// ============================================================

async function handleCommand(message) {
  const [commandRaw, ...args] =
    message.trim().split(/\s+/);

  const command = commandRaw.toLowerCase();

  switch (command) {
    case "/help":
addNexusMessage(
          [
            "COMMANDES",
            "",
            "/help     Afficher les commandes",
            "/status   État de NEXUS",
            "/project  Projet actif (état)",
            "/projects Liste des projets",
            "/memory   Mémoire longue",
            "/places   Lieux personnels : list / add / remove",
            "/model    Modèle actif",
            "/tools    Outils disponibles",
            "/attach   Ajouter des fichiers",
            "          (ex: /attach doc.pdf img.png)",
            "/files    Fichiers : statut, root, priority, downloaddir, pending",
            "/detach   Retirer un fichier (index ou nom)",
            "/detach all   Tout retirer",
            "/clear    Effacer la conversation",
            "/exit     Quitter NEXUS",
          ].join("\n")
        );
      break;

    case "/status":
      {
        const stats = memoryStats();

        const breakdown =
          Object.entries(stats.byType)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([type, count]) =>
                `${type} ${count}`
            )
            .join(" · ") || "aucune";

        const { sourcePriority } = getFilesSettings();

        addNexusMessage(
          [
            `CORE    ${nexusState.status}`,
            `PROJECT ${nexusState.project}`,
            `ROUTER  ${nexusState.routerModel}`,
            `MODEL   ${nexusState.responseModel}`,
            `ROUTE   ${nexusState.route}`,
            `TOOL    ${nexusState.tool}`,
            `FILES   ${pendingFiles.length} en attente · ` +
              `${sourcePriority === "drive" ? "Drive" : "local"} prioritaire`,
            `MÉMOIRE ${stats.total} notes (${breakdown})`,
          ].join("\n")
        );
      }
      break;

    case "/attach":
      if (!args.length) {
        addNexusMessage(
          "Usage : /attach <chemin> [chemin2 ...]"
        );
        break;
      }

      for (const rawPath of args) {
        const filePath = path.resolve(rawPath);

        try {
          const attachment =
            await readFileAsAttachment(filePath);

          pendingFiles.push(attachment);

          addNexusMessage(
            `Fichier ajouté : ` +
            `{${COLORS.user}-fg}${attachment.name}{/} ` +
            `({${COLORS.muted}-fg}${attachment.mimeType} · ${formatBytes(attachment.size)}{/})`
          );
        } catch (error) {
          addNexusMessage(
            `{${COLORS.error}-fg}Erreur : ${error.message}{/}`
          );
        }
      }

      addNexusMessage(
        pendingFiles.length
          ? `${pendingFiles.length} fichier(s) en attente. Pose ensuite ta question.`
          : "Aucun fichier en attente."
      );
      break;

    case "/files": {
      const sub = args[0]?.toLowerCase();

      if (sub === "pending") {
        if (!pendingFiles.length) {
          addNexusMessage("Aucun fichier en attente.");
          break;
        }

        addNexusMessage(
          [
            "FICHIERS EN ATTENTE",
            "",
            ...pendingFiles.map(
              (f, i) =>
                `{${COLORS.cyan}-fg}[${i}]{/} ${f.name} ` +
                `({${COLORS.muted}-fg}${f.mimeType} · ${formatBytes(f.size)}{/})`
            ),
            "",
            "Ils seront envoyés avec le prochain message.",
          ].join("\n")
        );
        break;
      }

      if (sub === "root") {
        const newRoot = args.slice(1).join(" ");

        if (!newRoot) {
          addNexusMessage("Usage : /files root <chemin> (ex: ~/Documents)");
          break;
        }

        const resolved = setFilesRoot(newRoot);
        addNexusMessage(`Racine fichiers définie : ${resolved}`);
        break;
      }

      if (sub === "priority") {
        const value = args[1]?.toLowerCase();

        if (!["local", "drive"].includes(value)) {
          addNexusMessage("Usage : /files priority local | drive");
          break;
        }

        setFilesPriority(value);
        addNexusMessage(
          `Source prioritaire des fichiers : ${value === "local" ? "LOCAL (Documents)" : "GOOGLE DRIVE"}.`
        );
        break;
      }

      if (sub === "downloaddir") {
        const newDir = args.slice(1).join(" ");

        if (!newDir) {
          addNexusMessage("Usage : /files downloaddir <chemin> (ex: ~/Téléchargements)");
          break;
        }

        const resolved = setFilesDownloadDir(newDir);
        addNexusMessage(`Dossier de téléchargement défini : ${resolved}`);
        break;
      }

      const { root, sourcePriority, downloadDir } = getFilesSettings();

      addNexusMessage(
        [
          "FICHIERS",
          "",
          `Racine locale : {${COLORS.cyan}-fg}${root}{/}`,
          `Source prioritaire : {${COLORS.cyan}-fg}${sourcePriority === "local" ? "LOCAL (disque)" : "GOOGLE DRIVE"}{/}`,
          `Dossier « téléchargements » (alias downloads) : {${COLORS.cyan}-fg}${downloadDir}{/}`,
          "",
          "Commandes : /files root <chemin> · /files priority <local|drive> · /files downloaddir <chemin> · /files pending",
        ].join("\n")
      );
      break;
    }

    case "/detach":
      if (args[0]?.toLowerCase() === "all") {
        pendingFiles.length = 0;
        addNexusMessage("Fichiers retirés de la file.");
        break;
      }

      if (!args.length) {
        addNexusMessage(
          "Usage : /detach <index> | <nom> | all"
        );
        break;
      }

      const target = args[0];

      const index =
        cmdFileIndex(pendingFiles, target);

      if (index === -1) {
        addNexusMessage(
          `{${COLORS.error}-fg}Fichier introuvable : ${target}{/}`
        );
        break;
      }

      const removed =
        pendingFiles.splice(index, 1)[0];

      addNexusMessage(
        `Fichier retiré : ${removed.name}`
      );
      break;

    case "/project":
      if (args.length && args[0] === "delete") {
        const target = args.slice(1).join(" ");

        if (!target) {
          addNexusMessage(
            "Usage : /project delete <nom>"
          );
          break;
        }

        try {
          const result = removeProject(target);

          if (nexusState.project === target) {
            nexusState.project =
              setActiveProject("NEXUS");
            renderCoreInfo();
          }

          addNexusMessage(
            `Projet « ${result.removed} » supprimé. ` +
            `${result.orphanedNotes} note(s) restée(s) en mémoire générale.`
          );
        } catch (error) {
          addNexusMessage(
            `{${COLORS.error}-fg}` +
            `${error.message}{/}`
          );
        }
        break;
      }

      if (args.length) {
        nexusState.project =
          setActiveProject(args.join(" "));

        try {
          initProject({ name: nexusState.project });
        } catch (error) {
          addNexusMessage(
            `{${COLORS.error}-fg}` +
            `Erreur mémoire : ${error.message}{/}`
          );
        }

        renderCoreInfo();
      }

      {
        const resume =
          projectResume(nexusState.project) ??
          { status: "active", goal: null, nextAction: null };

        const parts = [
          `PROJECT ${nexusState.project}`,
          `STATUS  ${resume.status}`,
        ];

        if (resume.goal) {
          parts.push(`GOAL    ${resume.goal}`);
        }

        if (resume.nextAction) {
          parts.push(
            `NEXT    ${resume.nextAction}`
          );
        }

        if (resume.lastCheckpoint) {
          parts.push(
            `CHECKPOINT ${resume.lastCheckpoint}`
          );
        }

        addNexusMessage(parts.join("\n"));
      }
      break;

    case "/projects":
      {
        const projects = listProjects();

        if (!projects.length) {
          addNexusMessage(
            "Aucun projet mémorisé."
          );
          break;
        }

        addNexusMessage(
          projects
            .map(
              p =>
                `- ${p.name} — ${p.status}` +
                `${p.nextAction
                  ? ` → ${p.nextAction}`
                  : ""}`
            )
            .join("\n")
        );
      }
      break;

    case "/memory":
      {
        const sub = (args[0] ?? "").toLowerCase();
        const rest = args.slice(1);

        if (sub === "count") {
          const stats = memoryStats();

          const breakdown =
            Object.entries(stats.byType)
              .sort((a, b) => b[1] - a[1])
              .map(
                ([type, count]) =>
                  `${type} ${count}`
              )
              .join(" · ") || "aucune";

          addNexusMessage(
            `Mémoire longue : ${stats.total} notes (${breakdown})`
          );
          break;
        }

        if (sub === "forget") {
          const id = rest[0];

          if (!id) {
            addNexusMessage(
              "Usage : /memory forget <id>"
            );
            break;
          }

          const target = getMemory(id);

          if (!target) {
            addNexusMessage(
              `Aucune note trouvée : ${id}`
            );
            break;
          }

          const removed = forgetMemory(id);

          addNexusMessage(
            removed
              ? `Note oubliée : ${target.title}`
              : `Impossible de supprimer : ${target.title}`
          );
          break;
        }

        if (sub === "list") {
          const notes = listMemories({
            limit: 20,
          });

          if (!notes.length) {
            addNexusMessage(
              "Mémoire longue vide."
            );
            break;
          }

          addNexusMessage(
            notes
              .map(
                note =>
                  `- ${note.id} ` +
                  `(${note.type}` +
                  `${note.projectId
                    ? ` · ${note.projectId}`
                    : ""}) ` +
                  `${note.title}`
              )
              .join("\n")
          );
          break;
        }

        if (sub === "search" || sub === "get") {
          const id = rest.join(" ");

          if (!id) {
            addNexusMessage(
              "Usage : /memory search <id ou mots-clés>"
            );
            break;
          }

          const direct = getMemory(id);

          if (direct) {
            addNexusMessage(
              `[${direct.type}] ` +
              `${direct.title} ` +
              `(imp ${direct.importance})\n` +
              `${direct.content}`
            );
            break;
          }

          const notes = recallMemories({
            keywords: rest,
            limit: 5,
          });

          if (!notes.length) {
            addNexusMessage(
              "Aucun souvenir trouvé."
            );
            break;
          }

          addNexusMessage(
            notes
              .map(
                note =>
                  `- ${note.id} ` +
                  `(imp ${note.importance}) ` +
                  `[${note.type}] ${truncate(
                    note.title,
                    80
                  )}\n` +
                  `    ${truncate(note.content, 120)}`
              )
              .join("\n\n")
          );
          break;
        }

        addNexusMessage(
          [
            "Mémoire longue",
            "/memory search <mots-clés>   Chercher",
            "/memory get <id>             Voir une note",
            "/memory list                 Lire les notes",
            "/memory forget <id>          Oublier une note",
            "/memory count                Compter les notes",
            "/memory relink               Reconstruire les liens↔",
          ].join("\n")
        );
      }
      break;

    case "/places":
      {
        const sub = (args[0] ?? "").toLowerCase();
        const rest = args.slice(1);

        if (sub === "add") {
          const name = rest[0];
          const address = rest.slice(1).join(" ");

          if (!name || !address) {
            addNexusMessage(
              "Usage : /places add <nom> <adresse>"
            );
            break;
          }

          try {
            const resolved = await geocode(address);

            savePlace({
              name,
              label: resolved.label,
              latitude: resolved.latitude,
              longitude: resolved.longitude,
              address,
            });

            const updated =
              listPlaces().some(
                (p) =>
                  p.name.toLowerCase() ===
                  name.toLowerCase()
              );

            addNexusMessage(
              `Lieu « ${name} » ${updated ? "mis à jour" : "ajouté"} : ` +
              `{${COLORS.cyan}-fg}${resolved.label}{/}`
            );
          } catch (error) {
            addNexusMessage(
              `{${COLORS.error}-fg}Erreur : ${error.message}{/}`
            );
          }
          break;
        }

        if (sub === "remove") {
          const name = rest.join(" ");

          if (!name) {
            addNexusMessage(
              "Usage : /places remove <nom>"
            );
            break;
          }

          const removed = removePlace(name);

          addNexusMessage(
            removed
              ? `Lieu « ${name} » supprimé.`
              : `{${COLORS.error}-fg}Aucun lieu « ${name} ».{/}`
          );
          break;
        }

        const places = listPlaces();

        if (!places.length) {
          addNexusMessage(
            "Aucun lieu enregistré. Utilise /places add <nom> <adresse>."
          );
          break;
        }

        addNexusMessage(
          [
            `LIEUX (${places.length})`,
            "",
            ...places.map(
              (place) =>
                `- {${COLORS.cyan}-fg}${place.name}{/}` +
                ` — ${place.label}` +
                ` ({${COLORS.muted}-fg}${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}{/})`
            ),
          ].join("\n")
        );
      }
      break;

    case "/model":
      if (args.length) {
        nexusState.responseModel = args.join(" ");
        renderCoreInfo();

        addNexusMessage(
          `Modèle actif : ${nexusState.responseModel}`
        );
      } else {
        addNexusMessage(
          `Router : ${nexusState.routerModel}\n` +
          `Model  : ${nexusState.responseModel}`
        );
      }
      break;

    case "/tools":
      addNexusMessage(
        [
          "NATIVE",
          "├─ TIME",
          "├─ WEATHER",
          "├─ WEB SEARCH",
          "├─ NAVIGATION",
          "├─ PROJECTS (init/set/checkpoint/log/status/resume)",
          "├─ GMAIL",
          "├─ CALENDAR",
          "├─ FILES (local + Drive : search/list/read/write/mkdir/move/copy)",
          "├─ LOCATION (position + lieux personnels : add/list/get/remove/distance)",
          "├─ HOME AUTOMATION",
          "└─ NAS",
          "",
          "MÉMOIRE (toutes les routes)",
          "memory_add · memory_search · memory_list",
          "memory_update · memory_forget",
          "",
          "MCP",
          "└─ PLAYWRIGHT",
        ].join("\n")
      );
      break;

    case "/clear":
      conversationPanel.setContent("");
      screen.render();
      break;

    case "/exit":
      shutdown();
      break;

    default:
      addNexusMessage(
        `Commande inconnue : ${command}`
      );
  }
}

function cmdFileIndex(files, target) {
  const asIndex = Number(target);

  if (Number.isInteger(asIndex) && files[asIndex]) {
    return asIndex;
  }

  return files.findIndex(
    f => f.name === target
  );
}

function prepareToolActivity() {
  // Padding avant la tâche
  conversationPanel.pushLine("");

  // Ligne outil
  conversationPanel.pushLine("");

  liveToolLine =
    conversationPanel.getLines().length - 1;

  // Ligne statut
  conversationPanel.pushLine("");

  liveToolStatusLine =
    conversationPanel.getLines().length - 1;

  conversationPanel.setScrollPerc(100);
  screen.render();
}

function updateToolActivity(
  tool,
  status = "running"
) {
  if (
    liveToolLine === null ||
    liveToolStatusLine === null
  ) {
    return;
  }

  let statusText =
    "Exécution en cours...";

  if (status === "done") {
    statusText = "Terminé.";
  }

  if (status === "error") {
    statusText = "Erreur.";
  }

  conversationPanel.setLine(
    liveToolLine,
    `{${COLORS.tool}-fg}◎ ${tool}{/}`
  );

  conversationPanel.setLine(
    liveToolStatusLine,
    `{${COLORS.muted}-fg}${statusText}{/}`
  );

  conversationPanel.setScrollPerc(100);

  screen.render();
}

function finishToolActivity() {
  liveToolLine = null;
  liveToolStatusLine = null;
}

// ============================================================
// REAL NEXUS
// ============================================================

async function realNexus(message, files = []) {
  setRoute("DIRECT");
  setTool("—");
  setOrbMode("THINKING");

  try {
    const answer = await askNexus(message, {
      files,
      onEvent(event) {
        switch (event.type) {
          case "thinking":
            setOrbMode("THINKING");
            break;

          case "route":
            setRoute(event.route);
            break;

          case "tool_start":
            setTool(event.tool);
            setOrbMode("TOOL");

            updateToolActivity(
              event.tool,
              "running"
            );

            break;

          case "tool_end":
            updateToolActivity(
              event.tool,
              "done"
            );

            setTool("—");
            setOrbMode("THINKING");

            break;

          case "tool_error":
            updateToolActivity(
              event.tool,
              "error"
            );

            setTool("—");
            setOrbMode("ERROR");

            break;

          case "tools_selected":
            break;

          case "usage":
            showUsage(event.usage);
            break;

          case "error":
            setOrbMode("ERROR");
            break;

          case "final":
            finishToolActivity();

            setTool("—");
            setOrbMode("SPEAKING");

            break;

            
          case "tool_error":
            showToolActivity(
              event.tool,
              "error"
            );

            setTool("—");
            setOrbMode("ERROR");

  break;
        }
      },
    });

    setTool("—");
    setOrbMode("SPEAKING");

    return answer;
  } catch (error) {
    setTool("—");
    setOrbMode("ERROR");
    throw error;
  }
}

let nexusBusy = false;

// ============================================================
// INPUT
// ============================================================
async function handleSubmit(value) {
  inputIsReading = false;

  const typed =
    String(value ?? "").trim();

  clearInput();
  hideSuggestions();

  let command = typed;

  // Commande partielle (ex: "/att") + menu ouvert
  // → l'Entrée exécute la commande sélectionnée dans le menu.
  if (
    typed.startsWith("/") &&
    !typed.includes(" ") &&
    suggestionState.visible &&
    suggestionState.matches.length > 0
  ) {
    command =
      suggestionState.matches[suggestionState.selected];
  }

  // ========================================================
  // COMMANDS
  // ========================================================

  if (command.startsWith("/")) {
    nexusBusy = true;

    try {
      await handleCommand(command);
    } finally {
      nexusBusy = false;
    }

    activateInput();
    return;
  }

  if (!typed && pendingFiles.length === 0) {
    activateInput();
    return;
  }

  // Évite deux requêtes simultanées
  if (nexusBusy) {
    activateInput();
    return;
  }

  // ========================================================
  // NEXUS
  // ========================================================

  nexusBusy = true;

  const files = [...pendingFiles];
  pendingFiles.length = 0;

  addUserMessage(typed, files);

  try {
    const answer =
      await realNexus(typed, files);

    addNexusMessage(answer);

    setTool("—");
    setOrbMode("IDLE");
  } catch (error) {
    setOrbMode("ERROR");

    addNexusMessage(
      `Erreur : ${error.message}`
    );
  } finally {
    nexusBusy = false;

    activateInput();
  }
}


// ============================================================
// EVENTS
// ============================================================

screen.key(["C-c"], shutdown);

screen.on("resize", () => {
  updateLayout();
  screen.render();
});

// Évite que le clic sur le terminal n'interfère avec la saisie :
// un release de souris remet simplement la saisie en route.
screen.on("mouse", data => {
  if (data.action === "mouseup" && !inputIsReading) {
    activateInput();
  }
});


// ============================================================
// UTILS
// ============================================================

function wait(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}

function shutdown() {
  clearInterval(orbAnimation);

  screen.program.showCursor();
  screen.destroy();

  process.exit(0);
}


// ============================================================
// INITIAL CONTENT
// ============================================================

[
  "",
  `{${COLORS.nexus}-fg}NEXUS{/}`,
  `{${COLORS.white}-fg}CLI initialisé. Neural Core opérationnel.{/}`,
  "",
  `{${COLORS.muted}-fg}Tape / pour explorer les commandes — ↑/↓ pour naviguer, Tab pour compléter.{/}`,
  "",
].forEach(line =>
  conversationPanel.pushLine(line)
);


// ============================================================
// START
// ============================================================

async function startCLI() {
  nexusState.project = getActiveProject();

  updateLayout();

  renderInput();

  orbAnimation = setInterval(
    renderOrb,
    70
  );

  setOrbMode("THINKING");
  screen.render();

  try {
    await startNexus();
    setOrbMode("IDLE");
  } catch (error) {
    setOrbMode("ERROR");

    addNexusMessage(
      `Erreur d'initialisation : ${error.message}`
    );
  }

  activateInput();
}

startCLI();