import {
  createWriteStream,
  existsSync,
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

// Navigateur réutilisé entre deux téléchargements : le premier
// lancement est lent, les suivants sont quasi instantanés.
let browserPromise = null;

async function sharedBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Google Chrome installé d'abord (rapide, déjà présent).
      const launch = (options) =>
        chromium.launch({
          headless: true,
          ...options,
        });

      const direct =
        await launch({
          channel: "chrome",
        }).catch(() => null);

      if (direct) {
        return direct;
      }

      const bundled =
        await launch({}).catch(() => null);

      if (bundled) {
        return bundled;
      }

      throw new Error(
        "Impossible de lancer un navigateur pour le téléchargement. " +
        "Installe Google Chrome, ou Chromium via : npx playwright install chromium"
      );
    })();

    browserPromise.catch(() => {
      browserPromise = null;
    });
  }

  return browserPromise;
}

export async function closeDownloadBrowser() {
  if (!browserPromise) {
    return;
  }

  try {
    const browser = await browserPromise;

    await browser.close();
  } catch {
    // Rien à faire.
  } finally {
    browserPromise = null;
  }
}

export async function downloadViaBrowser({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
  timeoutMs = 30_000,
} = {}) {
  if (!url) {
    throw new Error("URL manquante.");
  }

  const browser = await sharedBrowser();

  const context =
    await browser.newContext({
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
    });

  let page;

  try {
    page = await context.newPage();

    const downloadPromise =
      page.waitForEvent("download", {
        timeout: timeoutMs,
      });

    try {
      await page.goto(url, {
        waitUntil: "commit",
        timeout: timeoutMs,
        referer: headers.referer,
      });
    } catch {
      // L'URL peut déclencher le téléchargement avant la fin de la
      // navigation ; l'événement download arrive par ailleurs.
    }

    let download;

    try {
      download = await downloadPromise;
    } catch {
      throw new Error(
        "Le navigateur n'a pas déclenché de téléchargement pour cette URL. " +
        "Elle affiche peut-être une page : vérifie avec browser_snapshot, ou " +
        "donne l'URL du lien de téléchargement direct."
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

    return finalizeDownload({
      target,
      name,
      folder: dir,
      url,
    });
  } finally {
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
  }
}