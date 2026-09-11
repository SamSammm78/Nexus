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

async function launchBrowser() {
  const bundled =
    await chromium
      .launch({ headless: true })
      .catch((error) => null);

  if (bundled) {
    return bundled;
  }

  try {
    return await chromium.launch({
      headless: true,
      channel: "chrome",
    });
  } catch {
    throw new Error(
      "Impossible de lancer un navigateur pour le téléchargement. " +
      "Installe Chromium pour NEXUS : npx playwright install chromium " +
      "(ou installe Google Chrome)."
    );
  }
}

export async function downloadViaBrowser({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
  timeoutMs = 45_000,
} = {}) {
  if (!url) {
    throw new Error("URL manquante.");
  }

  const browser = await launchBrowser();

  try {
    const context =
      await browser.newContext({
        ignoreHTTPSErrors: true,
        acceptDownloads: true,
      });

    const page = await context.newPage();

    const downloadPromise =
      page.waitForEvent("download", {
        timeout: timeoutMs,
      });

    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
        referer: headers.referer,
      });
    } catch {
      // L'URL peut déclencher un téléchargement avant la fin de
      // la navigation ; on laisse l'événement download arriver.
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

    const name =
      safeDownloadName(
        filename || download.suggestedFilename()
      );

    const failure = await download.failure();

    if (failure) {
      throw new Error(
        `Le téléchargement a échoué : ${failure}`
      );
    }

    const dir = downloadTargetFolder(folder);

    const target = join(dir, name);

    if (existsSync(target) && confirmed !== true) {
      throw new Error(
        `Le fichier ${name} existe déjà : demande confirmation pour l'écraser (confirmed: true).`
      );
    }

    const counter = new ByteCounter(hardCap());

    const readStream = await download.createReadStream();

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
    await browser.close().catch(() => {});
  }
}