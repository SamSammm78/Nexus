const {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
} = require("electron");

const path = require("node:path");

// Désactive l'accélération GPU
// pour éviter les crashes Chromium
// sur ce Mac.

app.disableHardwareAcceleration();

let overlay = null;


function positionOverlay() {

  if (!overlay) {
    return;
  }

  const display =
    screen.getPrimaryDisplay();

  const {
    x,
    y,
    width,
  } = display.workArea;


  const [windowWidth] =
    overlay.getSize();


  overlay.setPosition(
    Math.round(
      x +
      width / 2 -
      windowWidth / 2
    ),

    y + 12,

    false
  );
}


function createOverlay() {

  overlay =
    new BrowserWindow({

      width:
        560,

      height:
        180,

      frame:
        false,

      transparent:
        true,

      resizable:
        false,

      movable:
        false,

      minimizable:
        false,

      maximizable:
        false,

      fullscreenable:
        false,

      show:
        false,

      skipTaskbar:
        true,

      hasShadow:
        false,

      alwaysOnTop:
        true,

      webPreferences: {

        contextIsolation:
          true,

        nodeIntegration:
          false,
      },
    });


  overlay.setAlwaysOnTop(
    true,
    "screen-saver"
  );


  overlay.setVisibleOnAllWorkspaces(
    true,
    {
      visibleOnFullScreen:
        true,
    }
  );


  overlay.loadFile(
    path.join(
      __dirname,
      "overlay.html"
    )
  );


  overlay.once(
    "ready-to-show",
    () => {

      positionOverlay();

      showOverlay();
    }
  );


  overlay.on(
    "blur",
    () => {

      // On laisse volontairement
      // l'overlay affiché pendant
      // le prototype.

    }
  );


  screen.on(
    "display-metrics-changed",
    positionOverlay
  );
}


function showOverlay() {

  if (!overlay) {
    return;
  }


  positionOverlay();

  overlay.show();

  overlay.focus();


  overlay.webContents.send(
    "overlay-focus"
  );
}


function hideOverlay() {

  if (!overlay) {
    return;
  }


  overlay.hide();
}


function toggleOverlay() {

  if (!overlay) {
    return;
  }


  if (
    overlay.isVisible()
  ) {

    hideOverlay();

  } else {

    showOverlay();
  }
}


app.whenReady()
  .then(
    () => {

      createOverlay();


      const registered =
        globalShortcut.register(
          "Alt+Space",
          toggleOverlay
        );


      console.log(
        registered
          ? "⌥ Space enregistré."
          : "Impossible d'enregistrer ⌥ Space."
      );
    }
  );


app.on(
  "will-quit",
  () => {

    globalShortcut
      .unregisterAll();

  }
);