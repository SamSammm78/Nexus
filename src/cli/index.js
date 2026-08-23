import blessed from "blessed";
import {
  startNexus,
  askNexus,
} from "../agent/nexus.js";

// ============================================================
// NEXUS CLI
// ============================================================

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: "NEXUS CLI",
});

screen.program.hideCursor();


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
  keys: true,
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
// INPUT
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

const input = blessed.textbox({
  parent: inputPanel,
  top: 0,
  left: 5,
  width: "100%-7",
  height: 3,

  inputOnFocus: false,

  // Important :
  // on évite les raccourcis avancés de Blessed.
  keys: false,

  mouse: true,
  tags: true,

  style: {
    fg: COLORS.white,
    bg: COLORS.bg,
  },
});

let inputIsReading = false;

function activateInput() {
  if (inputIsReading) return;

  inputIsReading = true;

  input.focus();

  input.readInput(() => {
    inputIsReading = false;
  });

  screen.render();
}


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

function addUserMessage(message) {
  pushConversation("");
  pushConversation(
    `{${COLORS.muted}-fg}TOI{/}`
  );

  pushConversation(
    `{${COLORS.user}-fg}${message}{/}`
  );

  prepareToolActivity();
}

function addNexusMessage(message) {
  pushConversation("");
  pushConversation(`{${COLORS.nexus}-fg}NEXUS{/}`);

  for (const line of String(message).split("\n")) {
    pushConversation(`{${COLORS.white}-fg}${line}{/}`);
  }
}

// ============================================================
// COMMANDS
// ============================================================

function handleCommand(message) {
  const [commandRaw, ...args] =
    message.trim().split(/\s+/);

  const command = commandRaw.toLowerCase();

  switch (command) {
    case "/help":
      addNexusMessage(
        [
          "COMMANDES",
          "",
          "/help              Afficher les commandes",
          "/status            État de NEXUS",
          "/project [nom]     Projet actif",
          "/model [nom]       Modèle actif",
          "/tools             Outils disponibles",
          "/clear             Effacer la conversation",
          "/exit              Quitter NEXUS",
        ].join("\n")
      );
      break;

    case "/status":
      addNexusMessage(
        [
          `CORE    ${nexusState.status}`,
          `PROJECT ${nexusState.project}`,
          `ROUTER  ${nexusState.routerModel}`,
          `MODEL   ${nexusState.responseModel}`,
          `ROUTE   ${nexusState.route}`,
          `TOOL    ${nexusState.tool}`,
        ].join("\n")
      );
      break;

    case "/project":
      if (args.length) {
        nexusState.project = args.join(" ");
        renderCoreInfo();
      }

      addNexusMessage(
        `Projet actif : ${nexusState.project}`
      );
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
          "└─ GMAIL",
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

async function realNexus(message) {
  setRoute("DIRECT");
  setTool("—");
  setOrbMode("THINKING");

  try {
    const answer = await askNexus(message, {
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
input.on("submit", async value => {
  inputIsReading = false;

  const message =
    String(value ?? "").trim();

  input.clearValue();

  if (!message) {
    activateInput();
    return;
  }

  // Évite deux requêtes simultanées
  if (nexusBusy) {
    activateInput();
    return;
  }

  // ========================================================
  // COMMANDS
  // ========================================================

  if (message.startsWith("/")) {
    handleCommand(message);

    activateInput();
    return;
  }

  // ========================================================
  // NEXUS
  // ========================================================

  nexusBusy = true;

  addUserMessage(message);

  try {
    const answer =
      await realNexus(message);

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
});

input.readEditor = () => {
  return;
};


// ============================================================
// EVENTS
// ============================================================

screen.key(["escape", "C-c"], shutdown);

screen.on("resize", () => {
  updateLayout();
  screen.render();
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
  `{${COLORS.muted}-fg}Commandes disponibles : /help{/}`,
  "",
].forEach(line =>
  conversationPanel.pushLine(line)
);


// ============================================================
// START
// ============================================================

async function startCLI() {
  updateLayout();

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