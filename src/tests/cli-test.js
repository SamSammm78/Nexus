import blessed from "blessed";


// ============================================================
// NEXUS CLI PROTOTYPE
// ============================================================
//
// Version TEST uniquement.
//
// Aucune connexion au vrai agent NEXUS pour l'instant.
//
// Plus tard, décommenter l'import correspondant :
//
// import { askNexus } from "../agent/nexus.js";
//
// ou adapter selon la fonction que ton nexus.js exportera.
//
// ============================================================



// ============================================================
// SCREEN
// ============================================================

const screen = blessed.screen({
  smartCSR: true,
  fullUnicode: true,
  title: "NEXUS CLI",
});


screen.program.hideCursor();



// ============================================================
// COLORS
// ============================================================

const COLORS = {

  cyan:
    "#38d9ff",

  cyanBright:
    "#7cecff",

  blue:
    "#458cff",

  white:
    "#f2f5f7",

  muted:
    "#62727e",

  border:
    "#182832",

  borderActive:
    "#305463",

  user:
    "#e8edf0",

  nexus:
    "#38d9ff",

  tool:
    "#658cff",

};



// ============================================================
// MAIN CONTAINER
// ============================================================

const root = blessed.box({

  parent:
    screen,

  top:
    0,

  left:
    0,

  width:
    "100%",

  height:
    "100%",

  style: {
    bg:
      "black",
  },

});



// ============================================================
// LEFT PANEL — ORB
// ============================================================

const orbPanel = blessed.box({

  parent:
    root,

  top:
    0,

  left:
    0,

  width:
    "34%",

  height:
    "100%-5",

  border: {
    type:
      "line",
  },

  style: {

    border: {
      fg:
        COLORS.border,
    },

  },

});



// ============================================================
// RIGHT PANEL — CONVERSATION
// ============================================================

const conversationPanel = blessed.box({

  parent:
    root,

  top:
    0,

  left:
    "34%-1",

  width:
    "66%+1",

  height:
    "100%-5",

  border: {
    type:
      "line",
  },

  label:
    " CONVERSATION ",

  tags:
    true,

  scrollable:
    true,

  alwaysScroll:
    true,

  keys:
    true,

  mouse:
    true,

  scrollbar: {

    ch:
      "│",

    style: {
      fg:
        COLORS.cyan,
    },

  },

  style: {

    border: {
      fg:
        COLORS.border,
    },

    label: {
      fg:
        COLORS.muted,
    },

  },

});



// ============================================================
// INPUT PANEL
// ============================================================

const inputPanel = blessed.box({

  parent:
    root,

  bottom:
    0,

  left:
    0,

  width:
    "100%",

  height:
    5,

  border: {
    type:
      "line",
  },

  style: {

    border: {
      fg:
        COLORS.borderActive,
    },

  },

});



const promptSymbol = blessed.text({

  parent:
    inputPanel,

  top:
    1,

  left:
    2,

  width:
    3,

  height:
    1,

  tags:
    true,

  content:
    `{${COLORS.cyan}-fg}>{/}`,

});



const input = blessed.textbox({

  parent:
    inputPanel,

  top:
    0,

  left:
    5,

  width:
    "100%-7",

  height:
    3,

  inputOnFocus:
    true,

  keys:
    true,

  mouse:
    true,

  tags:
    true,

  style: {

    fg:
      COLORS.white,

    bg:
      "black",

  },

});



// ============================================================
// ORB HEADER
// ============================================================

const title = blessed.box({

  parent:
    orbPanel,

  top:
    1,

  left:
    0,

  width:
    "100%",

  height:
    3,

  align:
    "center",

  tags:
    true,

  content:
    `{${COLORS.white}-fg}N   E   X   U   S{/}\n` +
    `{${COLORS.muted}-fg}NEURAL CORE{/}`,

});



// ============================================================
// ORB BOX
// ============================================================

const orbBox = blessed.box({

  parent:
    orbPanel,

  top:
    5,

  left:
    "center",

  width:
    "100%-4",

  height:
    22,

  align:
    "center",

  valign:
    "middle",

  tags:
    true,

});



// ============================================================
// ORB STATUS
// ============================================================

const orbStatus = blessed.box({

  parent:
    orbPanel,

  bottom:
    5,

  left:
    0,

  width:
    "100%",

  height:
    1,

  align:
    "center",

  tags:
    true,

});



const orbActivity = blessed.box({

  parent:
    orbPanel,

  bottom:
    3,

  left:
    0,

  width:
    "100%",

  height:
    1,

  align:
    "center",

  tags:
    true,

});



const orbHint = blessed.box({

  parent:
    orbPanel,

  bottom:
    1,

  left:
    0,

  width:
    "100%",

  height:
    1,

  align:
    "center",

  tags:
    true,

  content:
    `{${COLORS.muted}-fg}ESC quitter{/}`,

});



// ============================================================
// BRAILLE ORB
// ============================================================

const CHAR_WIDTH =
  34;

const CHAR_HEIGHT =
  18;


const PIXEL_WIDTH =
  CHAR_WIDTH * 2;

const PIXEL_HEIGHT =
  CHAR_HEIGHT * 4;


const CENTER_X =
  PIXEL_WIDTH / 2;

const CENTER_Y =
  PIXEL_HEIGHT / 2;


const RADIUS =
  Math.min(
    PIXEL_WIDTH * 0.40,
    PIXEL_HEIGHT * 0.40
  );



const BRAILLE_MAP = [

  [0x01, 0x08],

  [0x02, 0x10],

  [0x04, 0x20],

  [0x40, 0x80],

];



// ============================================================
// PIXEL CANVAS
// ============================================================

function createCanvas() {

  return Array.from(

    {
      length:
        PIXEL_HEIGHT,
    },

    () =>
      new Uint8Array(
        PIXEL_WIDTH
      )

  );

}



function setPixel(
  canvas,
  x,
  y
) {

  x =
    Math.round(
      x
    );

  y =
    Math.round(
      y
    );


  if (
    x < 0 ||
    x >= PIXEL_WIDTH ||
    y < 0 ||
    y >= PIXEL_HEIGHT
  ) {
    return;
  }


  canvas[y][x] =
    1;

}



// ============================================================
// DRAW LINE
// ============================================================

function drawLine(
  canvas,
  x0,
  y0,
  x1,
  y1,
  density = 1
) {

  const dx =
    x1 - x0;

  const dy =
    y1 - y0;


  const steps =
    Math.ceil(
      Math.max(
        Math.abs(dx),
        Math.abs(dy)
      )
    );


  if (
    steps <= 0
  ) {
    return;
  }


  for (
    let i = 0;
    i <= steps;
    i++
  ) {

    if (
      density < 1 &&
      Math.random() >
        density
    ) {
      continue;
    }


    const t =
      i / steps;


    setPixel(

      canvas,

      x0 +
        dx * t,

      y0 +
        dy * t

    );

  }

}



// ============================================================
// DRAW CIRCLE
// ============================================================

function drawCircle(
  canvas,
  cx,
  cy,
  radius,
  density = 1
) {

  const steps =
    Math.floor(
      radius * 15
    );


  for (
    let i = 0;
    i < steps;
    i++
  ) {

    if (
      density < 1 &&
      Math.random() >
        density
    ) {
      continue;
    }


    const angle =
      (
        i / steps
      )
      *
      Math.PI
      *
      2;


    setPixel(

      canvas,

      cx +
        Math.cos(angle)
        *
        radius,

      cy +
        Math.sin(angle)
        *
        radius

    );

  }

}



// ============================================================
// NODE DRAWING
// ============================================================

function drawNode(
  canvas,
  x,
  y,
  size = 1
) {

  setPixel(
    canvas,
    x,
    y
  );


  if (
    size >= 2
  ) {

    setPixel(
      canvas,
      x + 1,
      y
    );

    setPixel(
      canvas,
      x - 1,
      y
    );

    setPixel(
      canvas,
      x,
      y + 1
    );

    setPixel(
      canvas,
      x,
      y - 1
    );

  }


  if (
    size >= 3
  ) {

    setPixel(
      canvas,
      x + 2,
      y
    );

    setPixel(
      canvas,
      x - 2,
      y
    );

    setPixel(
      canvas,
      x,
      y + 2
    );

    setPixel(
      canvas,
      x,
      y - 2
    );

  }

}



// ============================================================
// SPHERE NODES
// ============================================================

const NODE_COUNT =
  38;


const nodes =
  [];


function randomSpherePoint() {

  const theta =
    Math.random()
    *
    Math.PI
    *
    2;


  const y =
    Math.random()
    *
    2
    -
    1;


  const radius =
    Math.sqrt(
      1 -
      y * y
    );


  return {

    x:
      radius *
      Math.cos(theta),

    y,

    z:
      radius *
      Math.sin(theta),

  };

}



for (
  let i = 0;
  i < NODE_COUNT;
  i++
) {

  nodes.push(
    {
      ...randomSpherePoint(),

      pulse:
        Math.random()
        *
        Math.PI
        *
        2,
    }
  );

}



// ============================================================
// ROTATION
// ============================================================

function rotateY(
  point,
  angle
) {

  const cos =
    Math.cos(angle);

  const sin =
    Math.sin(angle);


  return {

    x:
      point.x * cos
      -
      point.z * sin,

    y:
      point.y,

    z:
      point.x * sin
      +
      point.z * cos,

  };

}



function rotateX(
  point,
  angle
) {

  const cos =
    Math.cos(angle);

  const sin =
    Math.sin(angle);


  return {

    x:
      point.x,

    y:
      point.y * cos
      -
      point.z * sin,

    z:
      point.y * sin
      +
      point.z * cos,

  };

}



// ============================================================
// PROJECTION
// ============================================================

function project(
  point
) {

  const perspective =
    1 +
    point.z
    *
    0.10;


  return {

    x:
      CENTER_X
      +
      point.x
      *
      RADIUS
      *
      perspective,

    y:
      CENTER_Y
      +
      point.y
      *
      RADIUS
      *
      perspective,

    z:
      point.z,

  };

}



// ============================================================
// BRAILLE ENCODER
// ============================================================

function canvasToBraille(
  canvas
) {

  let output =
    "";


  for (
    let charY = 0;
    charY < CHAR_HEIGHT;
    charY++
  ) {

    for (
      let charX = 0;
      charX < CHAR_WIDTH;
      charX++
    ) {

      let code =
        0;


      for (
        let py = 0;
        py < 4;
        py++
      ) {

        for (
          let px = 0;
          px < 2;
          px++
        ) {

          const x =
            charX * 2
            +
            px;


          const y =
            charY * 4
            +
            py;


          if (
            canvas[y]?.[x]
          ) {

            code |=
              BRAILLE_MAP[
                py
              ][
                px
              ];

          }

        }

      }


      output +=
        code === 0

          ? " "

          : String.fromCharCode(
              0x2800 +
              code
            );

    }


    if (
      charY <
      CHAR_HEIGHT - 1
    ) {

      output +=
        "\n";

    }

  }


  return output;

}



// ============================================================
// ORB STATE
// ============================================================

let orbMode =
  "IDLE";


let orbTime =
  0;



function setOrbMode(
  mode,
  toolName = null
) {

  orbMode =
    mode;


  if (
    mode ===
    "IDLE"
  ) {

    orbStatus.setContent(
      `{${COLORS.cyan}-fg}● CORE ONLINE{/}`
    );

    orbActivity.setContent(
      `{${COLORS.muted}-fg}Ready{/}`
    );

  }


  if (
    mode ===
    "THINKING"
  ) {

    orbStatus.setContent(
      `{${COLORS.cyanBright}-fg}◌ THINKING{/}`
    );

    orbActivity.setContent(
      `{${COLORS.muted}-fg}Processing request...{/}`
    );

  }


  if (
    mode ===
    "TOOL"
  ) {

    orbStatus.setContent(
      `{${COLORS.tool}-fg}◎ ${
        toolName ??
        "TOOL"
      }{/}`
    );

    orbActivity.setContent(
      `{${COLORS.muted}-fg}Executing capability...{/}`
    );

  }


  if (
    mode ===
    "ERROR"
  ) {

    orbStatus.setContent(
      "{red-fg}! ERROR{/}"
    );

    orbActivity.setContent(
      `{${COLORS.muted}-fg}Something went wrong{/}`
    );

  }


  screen.render();

}



// ============================================================
// ORB SETTINGS
// ============================================================

function getOrbSettings() {

  if (
    orbMode ===
    "THINKING"
  ) {

    return {

      speed:
        0.020,

      distance:
        0.68,

      color:
        COLORS.cyanBright,

    };

  }


  if (
    orbMode ===
    "TOOL"
  ) {

    return {

      speed:
        0.014,

      distance:
        0.58,

      color:
        COLORS.blue,

    };

  }


  return {

    speed:
      0.006,

    distance:
      0.56,

    color:
      COLORS.cyan,

  };

}



// ============================================================
// RENDER ORB
// ============================================================

function renderOrb() {

  const settings =
    getOrbSettings();


  const canvas =
    createCanvas();


  drawCircle(
    canvas,
    CENTER_X,
    CENTER_Y,
    RADIUS,
    0.92
  );


  drawCircle(
    canvas,
    CENTER_X,
    CENTER_Y,
    RADIUS * 0.94,
    0.12
  );


  const angleY =
    orbTime
    *
    settings.speed;


  const angleX =
    Math.sin(
      orbTime *
      0.008
    )
    *
    0.18;


  const transformed =
    nodes.map(
      node => {

        let point =
          rotateY(
            node,
            angleY
          );


        point =
          rotateX(
            point,
            angleX
          );


        return {
          ...project(
            point
          ),

          original:
            node,
        };

      }
    );


  // connections

  for (
    let i = 0;
    i < transformed.length;
    i++
  ) {

    for (
      let j = i + 1;
      j < transformed.length;
      j++
    ) {

      const a =
        nodes[i];

      const b =
        nodes[j];


      const dx =
        a.x - b.x;

      const dy =
        a.y - b.y;

      const dz =
        a.z - b.z;


      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy +
          dz * dz
        );


      if (
        distance >
        settings.distance
      ) {
        continue;
      }


      const pa =
        transformed[i];

      const pb =
        transformed[j];


      drawLine(

        canvas,

        pa.x,
        pa.y,

        pb.x,
        pb.y,

        (
          pa.z +
          pb.z
        ) / 2 >
        0

          ? 0.75

          : 0.20

      );

    }

  }


  // nodes

  for (
    const node
    of transformed
  ) {

    let size =
      1;


    if (
      node.z >
      0.25
    ) {

      size =
        2;

    }


    if (
      node.z >
      0.72
    ) {

      size =
        3;

    }


    drawNode(
      canvas,
      node.x,
      node.y,
      size
    );

  }


  // central core

  const pulse =
    (
      Math.sin(
        orbTime *
        0.08
      )
      +
      1
    )
    /
    2;


  drawCircle(

    canvas,

    CENTER_X,
    CENTER_Y,

    2.5 +
    pulse * 2,

    1

  );


  drawNode(
    canvas,
    CENTER_X,
    CENTER_Y,
    3
  );


  const output =
    canvasToBraille(
      canvas
    );


  orbBox.setContent(
    `{${settings.color}-fg}${output}{/}`
  );


  orbTime++;


  screen.render();

}



// ============================================================
// CONVERSATION HELPERS
// ============================================================

function addUserMessage(
  message
) {

  conversationPanel.pushLine(
    ""
  );


  conversationPanel.pushLine(
    `{${COLORS.muted}-fg}TOI{/}`
  );


  conversationPanel.pushLine(
    `{${COLORS.user}-fg}${message}{/}`
  );


  conversationPanel.setScrollPerc(
    100
  );


  screen.render();

}



function addNexusMessage(
  message
) {

  conversationPanel.pushLine(
    ""
  );


  conversationPanel.pushLine(
    `{${COLORS.nexus}-fg}NEXUS{/}`
  );


  conversationPanel.pushLine(
    `{${COLORS.white}-fg}${message}{/}`
  );


  conversationPanel.setScrollPerc(
    100
  );


  screen.render();

}



function addToolMessage(
  tool
) {

  conversationPanel.pushLine(
    ""
  );


  conversationPanel.pushLine(
    `{${COLORS.tool}-fg}◎ ${tool}{/}`
  );


  conversationPanel.pushLine(
    `{${COLORS.muted}-fg}Exécution en cours...{/}`
  );


  conversationPanel.setScrollPerc(
    100
  );


  screen.render();

}



// ============================================================
// TEST RESPONSE
// ============================================================

async function fakeNexus(
  message
) {

  setOrbMode(
    "THINKING"
  );


  await wait(
    800
  );


  // ----------------------------------------------------------
  // Simulation tool
  // ----------------------------------------------------------

  if (
    message
      .toLowerCase()
      .includes(
        "mail"
      )
  ) {

    setOrbMode(
      "TOOL",
      "GMAIL"
    );


    addToolMessage(
      "GMAIL"
    );


    await wait(
      1200
    );


    setOrbMode(
      "IDLE"
    );


    return (
      "Simulation : j'ai trouvé 3 mails importants."
    );

  }


  if (
    message
      .toLowerCase()
      .includes(
        "trajet"
      )
  ) {

    setOrbMode(
      "TOOL",
      "NAVIGATION"
    );


    addToolMessage(
      "NAVIGATION"
    );


    await wait(
      1200
    );


    setOrbMode(
      "IDLE"
    );


    return (
      "Simulation : itinéraire calculé en 47 minutes."
    );

  }


  await wait(
    500
  );


  setOrbMode(
    "IDLE"
  );


  return (
    `Tu m'as demandé : "${message}". ` +
    `Pour l'instant, cette réponse est simulée.`
  );

}



// ============================================================
// REAL NEXUS CONNECTION — LATER
// ============================================================
//
// Quand tu voudras connecter le vrai NEXUS,
// cette fonction remplacera fakeNexus().
//
// Exemple :
//
// async function realNexus(message) {
//
//   setOrbMode(
//     "THINKING"
//   );
//
//   try {
//
//     const answer =
//       await askNexus(
//         message
//       );
//
//     setOrbMode(
//       "IDLE"
//     );
//
//     return answer;
//
//   } catch (error) {
//
//     setOrbMode(
//       "ERROR"
//     );
//
//     throw error;
//
//   }
// }
//
//
//
// Puis plus bas remplacer :
//
// const answer =
//   await fakeNexus(message);
//
// par :
//
// const answer =
//   await realNexus(message);
//
// ============================================================



// ============================================================
// INPUT
// ============================================================

input.on(
  "submit",

  async value => {

    const message =
      value.trim();


    input.clearValue();


    input.focus();


    if (
      !message
    ) {

      screen.render();

      return;

    }


    addUserMessage(
      message
    );


    try {

      // =====================================================
      // TEST MODE
      // =====================================================

      const answer =
        await fakeNexus(
          message
        );


      // =====================================================
      // FUTURE REAL MODE
      // =====================================================
      //
      // const answer =
      //   await realNexus(
      //     message
      //   );
      //


      addNexusMessage(
        answer
      );

    } catch (
      error
    ) {

      addNexusMessage(
        `Erreur : ${error.message}`
      );

    }


    input.focus();


    screen.render();

  }
);



// ============================================================
// ENTER
// ============================================================

input.key(
  "enter",

  () => {

    input.submit();

  }
);



// ============================================================
// EXIT
// ============================================================

screen.key(
  [
    "escape",
    "C-c"
  ],

  () => {

    clearInterval(
      orbAnimation
    );


    screen.program.showCursor();


    screen.destroy();


    process.exit(
      0
    );

  }
);



// ============================================================
// UTILS
// ============================================================

function wait(
  ms
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}



// ============================================================
// INITIAL CONTENT
// ============================================================

conversationPanel.pushLine(
  ""
);


conversationPanel.pushLine(
  `{${COLORS.nexus}-fg}NEXUS{/}`
);


conversationPanel.pushLine(
  `{${COLORS.white}-fg}Interface CLI de test initialisée.{/}`
);


conversationPanel.pushLine(
  ""
);


conversationPanel.pushLine(
  `{${COLORS.muted}-fg}Essaie par exemple :{/}`
);


conversationPanel.pushLine(
  `{${COLORS.muted}-fg}• bonjour{/}`
);


conversationPanel.pushLine(
  `{${COLORS.muted}-fg}• regarde mes mails{/}`
);


conversationPanel.pushLine(
  `{${COLORS.muted}-fg}• calcule un trajet{/}`
);



// ============================================================
// START
// ============================================================

setOrbMode(
  "IDLE"
);


const orbAnimation =
  setInterval(
    renderOrb,
    70
  );


input.focus();


screen.render();