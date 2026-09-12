import {
  createWriteStream,
  existsSync,
  mkdirSync,
} from "node:fs";
import {
  Transform,
} from "node:stream";
import {
  pipeline,
} from "node:stream/promises";
import {
  join,
} from "node:path";
import {
  spawnSync,
} from "node:child_process";

import { chromium } from "playwright";

import {
  downloadTargetFolder,
  safeDownloadName,
  finalizeDownload,
  hardCap,
} from "../files/download.js";
import {
  removeFileQuietly,
} from "../../utils/fs.js";
import {
  browserProfileDir,
  writeCookieJar,
} from "./profiles.js";

class ByteCounter extends Transform {
  constructor(limit) {
    super();

    this.limit = limit;
    this.bytes = 0;
  }

  _transform(chunk, _encoding, callback) {
    this.bytes += chunk.length;

    if (this.bytes > this.limit) {
      callback(
        new Error(
          `Fichier trop volumineux (>${this.limit} octets).`
        )
      );
      return;
    }

    callback(null, chunk);
  }
}

// Contexte persistant réutilisé entre deux téléchargements : le profil
// Chrome mémorise les cookies (compte étudiant, etc.) d'une session à
// l'autre. Le premier lancement est lent, les suivants quasi instantanés.
let sharedContextPromise = null;
let sharedContextHeadless = true;

// Ne cible QUE les Chrome orphelins de NOTRE profil persistant
// (jamais le Chrome de l'utilisateur ni celui du MCP).
function killStaleProfileChrome(profile) {
  try {
    const probe = spawnSync(
      "pgrep",
      ["-f", `user-data-dir=${profile}`],
      { encoding: "utf8" }
    );

    if (probe.status !== 0 || !probe.stdout.trim()) {
      return;
    }

    const pids = probe.stdout
      .trim()
      .split("\n")
      .map(Number)
      .filter(Boolean);

    for (const pid of pids) {
      try {
        const info = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
          encoding: "utf8",
        });

        if ((info.stdout ?? "").includes(`user-data-dir=${profile}`)) {
          process.kill(pid, "SIGKILL");
        }
      } catch {
        // Processus déjà terminé.
      }
    }
  } catch {
    // pgrep indisponible : on tente quand même le lancement.
  }
}

async function launchContext(headless) {
  const profile = browserProfileDir();

  mkdirSync(profile, { recursive: true });

  const attempt = () =>
    chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless,
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });

  try {
    return await attempt();
  } catch (launchError) {
    // Un Chrome orphelin (NEXUS tué pendant un téléchargement) bloque le
    // profil : on le termine ciblé puis on relance une fois.
    killStaleProfileChrome(profile);

    return attempt();
  }
}

// Réutilise TOUJOURS la même page (fenêtre/onglet) du profil persistant :
// aucun onglet about:blank supplémentaire n'est créé à chaque téléchargement.
async function sharedPage(context) {
  const pages = context.pages();

  const existing = pages.find((page) => !page.isClosed());

  if (existing) {
    return existing;
  }

  return context.newPage();
}

async function sharedContext(headless) {
  if (
    sharedContextPromise &&
    sharedContextHeadless === headless
  ) {
    return sharedContextPromise;
  }

  if (sharedContextPromise) {
    await clearSharedContext();
  }

  sharedContextHeadless = headless;

  sharedContextPromise = launchContext(headless);

  sharedContextPromise.catch(() => {
    sharedContextPromise = null;
  });

  return sharedContextPromise;
}

async function clearSharedContext() {
  const pending = sharedContextPromise;

  sharedContextPromise = null;

  if (!pending) {
    return;
  }

  try {
    const context = await pending;

    context.on("page", (page) => {
      page.close().catch(() => {});
    });

    await context.close();
  } catch {
    // Rien à faire.
  }
}

export async function closeDownloadBrowser() {
  await clearSharedContext();
}

async function refreshCookieJar(context) {
  try {
    const cookies = await context.cookies();

    writeCookieJar(cookies);
  } catch {
    // Une erreur d'export n'empêche pas le téléchargement.
  }
}

// Télécharge via un téléchargement déclenché par le navigateur.
async function captureDownload({
  page,
  url,
  folder,
  filename,
  confirmed,
  timeoutMs,
}) {
  const downloadPromise =
    page.waitForEvent("download");

  const gotoPromise =
    page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    }).then(
      () => "navigated",
      () => "aborted"
    );

  let download = await Promise.race([
    downloadPromise
      .then((d) => d)
      .catch(() => null),
    gotoPromise.then(() => null),
  ]);

  if (!download) {
    // Navigation arrivée à son terme sans téléchargement, ou annulée :
    // courte grâce pour les téléchargements déclenchés juste après le
    // chargement, sinon échec immédiat (pas d'attente de 30 s).
    download = await Promise.race([
      downloadPromise
        .then((d) => d)
        .catch(() => null),
      new Promise((resolve) =>
        setTimeout(() => resolve(null), 2_500)
      ),
    ]);
  }

  if (!download) {
    const loginError = new Error(
      "Le navigateur a affiché une page sans déclencher de téléchargement : " +
      "le site demande probablement une connexion (compte étudiant, etc.)."
    );

    loginError.code = "LOGIN_REQUIRED";

    throw loginError;
  }

  const failure = await download.failure();

  if (failure) {
    throw new Error(
      `Le téléchargement a échoué : ${failure}`
    );
  }

  const name =
    safeDownloadName(
      filename || download.suggestedFilename()
    );

  const dir = downloadTargetFolder(folder);

  const target = join(dir, name);

  if (existsSync(target) && confirmed !== true) {
    throw new Error(
      `Le fichier ${name} existe déjà : demande confirmation pour l'écraser (confirmed: true).`
    );
  }

  const counter = new ByteCounter(hardCap());

  const readStream =
    await download.createReadStream();

  try {
    await pipeline(
      readStream,
      counter,
      createWriteStream(target)
    );
  } catch (error) {
    removeFileQuietly(target);

    throw error;
  }

  return finalizeDownload({
    target,
    name,
    folder: dir,
    url,
  });
}

// Repli interactif : ouvre une fenêtre Chrome visible (même profil
// persistant) sur l'URL bloquée pour laisser l'utilisateur se connecter.
// Une fois connecté, on capture le téléchargement ou on surveille les
// clics de l'utilisateur. Les cookies sont exportés en continu.
async function buildSessionInteractively({
  url,
  folder,
  filename,
  confirmed,
  timeoutMs,
  loginWaitMs = 3 * 60_000,
}) {
  const context = await sharedContext(false);

  const page = await sharedPage(context);

  await page.goto(url, {
    waitUntil: "committed",
    timeout: timeoutMs,
  }).catch(() => {});

  const cookieTimer = setInterval(() => {
    refreshCookieJar(context);
  }, 5_000);

  let download = null;

  try {
    download = await Promise.race([
      page.waitForEvent("download")
        .then((d) => d)
        .catch(() => null),
      new Promise((resolve) =>
        setTimeout(() => resolve(null), loginWaitMs)
      ),
    ]);

    if (!download) {
      throw new Error(
        "Aucun téléchargement après connexion : connecte-toi sur la page " +
        "ouverte, déclenche la récupération du fichier, puis relance le " +
        "téléchargement. La session est maintenant enregistrée."
      );
    }

    const failure = await download.failure();

    if (failure) {
      throw new Error(
        `Le téléchargement a échoué : ${failure}`
      );
    }

    const name =
      safeDownloadName(
        filename || download.suggestedFilename()
      );

    const dir = downloadTargetFolder(folder);

    const target = join(dir, name);

    if (existsSync(target) && confirmed !== true) {
      throw new Error(
        `Le fichier ${name} existe déjà : demande confirmation pour l'écraser (confirmed: true).`
      );
    }

    const counter = new ByteCounter(hardCap());

    const readStream =
      await download.createReadStream();

    try {
      await pipeline(
        readStream,
        counter,
        createWriteStream(target)
      );
    } catch (error) {
      removeFileQuietly(target);

      throw error;
    }

    return {
      ...finalizeDownload({
        target,
        name,
        folder: dir,
        url,
      }),
      gainedSession: true,
    };
  } finally {
    clearInterval(cookieTimer);

    // La fenêtre reste ouverte sur le site (pratique pour confirmer la
    // connexion ou relancer un téléchargement au clic).
    refreshCookieJar(context);
  }
}

export async function downloadViaBrowser({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
  timeoutMs = 30_000,
  interactive = true,
  loginWaitMs,
} = {}) {
  if (!url) {
    throw new Error("URL manquante.");
  }

  // 1) Tentative rapide : profil persistant en mode silencieux.
  //    Si l'utilisateur est déjà connecté (cookies préservés), c'est fait.
  const headlessContext =
    await sharedContext(true);

  const headlessPage =
    await sharedPage(headlessContext);

  try {
    return await captureDownload({
      page: headlessPage,
      url,
      folder,
      filename,
      confirmed,
      timeoutMs,
    });
  } catch (error) {
    refreshCookieJar(headlessContext);

    if (error?.code !== "LOGIN_REQUIRED") {
      // La session du profil persistant est à jour même en cas d'échec.
      throw error;
    }
  }

  // 2) Le site exige une session : on ouvre la même URL en fenêtre
  //    visible pour que l'utilisateur se connecte (une seule fois, les
  //    cookies sont ensuite mémorisés).
  if (process.env.NEXUS_FILES_NO_INTERACTIVE === "1") {
    const error = new Error(
      "Le site demande une connexion (mode automatique désactivé, " +
      "interactive interdite)."
    );

    error.code = "LOGIN_REQUIRED";

    throw error;
  }

  if (interactive === false) {
    throw new Error(
      "Le téléchargement demande une session (page de connexion affichée) : " +
      "relance avec interactive: true ou connecte-toi via le navigateur, " +
      "puis donnes-en l'URL directe."
    );
  }

  return buildSessionInteractively({
    url,
    folder,
    filename,
    confirmed,
    timeoutMs,
    loginWaitMs,
  });
}