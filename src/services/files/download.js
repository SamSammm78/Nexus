import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import {
  execFile,
} from "node:child_process";
import {
  promisify,
} from "node:util";
import {
  pipeline,
} from "node:stream/promises";
import {
  Readable,
} from "node:stream";
import {
  isAbsolute,
  join,
  resolve,
  basename,
  extname,
} from "node:path";

import { resolveRoot, defaultDownloadDir } from "./settings.js";
import {
  validateMagic,
  removeFileQuietly,
  looksLikeHtml,
} from "../../utils/fs.js";
import {
  cookieJarPath,
  cookieJarReady,
} from "../browser/profiles.js";

export const DEFAULT_DOWNLOAD_FOLDER = "downloads";

const DEFAULT_BIG_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

function bigThreshold() {
  return Number(
    process.env.NEXUS_FILES_DOWNLOAD_BIG ?? DEFAULT_BIG_BYTES
  );
}

export function hardCap() {
  return Number(
    process.env.NEXUS_FILES_DOWNLOAD_MAX ?? DEFAULT_MAX_BYTES
  );
}

export function downloadTargetFolder(folder) {
  const root = resolveRoot();

  const base = folder
    ? isAbsolute(folder)
      ? resolve(folder)
      : resolve(join(root, folder))
    : defaultDownloadDir();

  mkdirSync(base, { recursive: true });

  return base;
}

export function safeDownloadName(name) {
  return (
    basename(name ?? "")
      .replace(/[/\\]/g, "_")
      .replace(/\s+/g, "_") ||
    `telechargement-${Date.now()}`
  );
}

export function finalizeDownload({
  target,
  name,
  folder,
  url,
}) {
  const issue = validateMagic(target, name);

  if (issue) {
    removeFileQuietly(target);

    const error = new Error(issue);

    error.code = "INVALID_DOWNLOAD";

    throw error;
  }

  return {
    path: target,
    name: safeDownloadName(name),
    folder,
    size: statSync(target).size,
    url,
  };
}

export async function downloadUrl({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
} = {}) {
  if (!url) {
    throw new Error("URL manquante.");
  }

  const parsed = new URL(url);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `Protocole non autorisé : ${parsed.protocol}`
    );
  }

  // Session connue (cookie jar) → curl avec les cookies : authentifié et
  // rapide, sans ouvrir de navigateur.
  if (cookieJarReady()) {
    return await downloadUrlWithJar({
      url,
      folder,
      filename,
      confirmed,
      headers,
    });
  }

  return await downloadUrlWithFetch({
    url,
    folder,
    filename,
    confirmed,
    headers,
  });
}

async function downloadUrlWithFetch({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
}) {
  const parsed = new URL(url);

  const response = await fetch(url, {
    headers: {
      "user-agent": "NEXUS/1.0",
      ...headers,
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Téléchargement refusé (HTTP ${response.status})`
    );
  }

  const contentLength = Number(
    response.headers.get("content-length") || 0
  );

  if (contentLength > hardCap()) {
    throw new Error(
      `Fichier trop volumineux (${contentLength} octets) : dépasse le plafond.`
    );
  }

  const name =
    filename ||
    decodeURIComponent(
      basename(parsed.pathname)
    ) ||
    `telechargement-${Date.now()}`;

  const safeName = safeDownloadName(name);

  const binaryExt =
    [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".7z", ".gz", ".docx", ".xlsx"]
      .includes(extname(safeName).toLowerCase());

  if (binaryExt) {
    const contentType = String(
      response.headers.get("content-type") || ""
    ).toLowerCase();

    if (contentType.startsWith("text/html")) {
      const error = new Error(
        "Le serveur a renvoyé une page HTML (connexion, erreur ou anti-bot) au lieu du fichier. " +
        "Essaie de retélécharger avec browser: true pour utiliser la session du navigateur."
      );

      error.code = "INVALID_DOWNLOAD";

      throw error;
    }
  }

  if (!response.body) {
    throw new Error("Réponse vide du serveur.");
  }

  const dir = downloadTargetFolder(folder);

  const target = join(dir, safeName);

  const big =
    contentLength > bigThreshold() ||
    contentLength === 0;

  if (big && confirmed !== true) {
    throw new Error(
      "Téléchargement volumineux ou taille inconnue : demande confirmation explicite à l'utilisateur puis relance avec confirmed: true."
    );
  }

  if (existsSync(target) && confirmed !== true) {
    throw new Error(
      `Le fichier ${safeName} existe déjà : demande confirmation pour l'écraser (confirmed: true).`
    );
  }

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(target)
    );
  } catch (error) {
    removeFileQuietly(target);

    throw error;
  }

  return finalizeDownload({
    target,
    name: safeName,
    folder: dir,
    url,
  });
}

const execFileAsync = promisify(execFile);

function parseHeader(headerText, name) {
  const prefix = `${name}:`;

  for (const line of (headerText ?? "").split("\n")) {
    if (line.toLowerCase().startsWith(prefix.toLowerCase())) {
      return line.slice(prefix.length).trim();
    }
  }

  return null;
}

// Téléchargement authentifié et rapide : curl réutilise le cookie jar
// enregistré (session compte étudiant, etc.) — aucune navigation.
async function downloadUrlWithJar({
  url,
  folder,
  filename,
  confirmed = false,
  headers = {},
}) {
  const parsed = new URL(url);
  const jar = cookieJarPath();

  const probe = await execFileAsync(
    "curl",
    [
      "-sIL",
      "-A", "NEXUS/1.0",
      "-b", jar,
      ...(headers.referer ? ["-e", headers.referer] : []),
      "--max-time", "20",
      url,
    ],
    { timeout: 25_000 }
  );

  const contentType = String(
    parseHeader(probe.stdout, "content-type") || ""
  ).toLowerCase();

  const finalUrl = parseHeader(probe.stdout, "location");
  const resolved = finalUrl
    ? new URL(finalUrl, url).toString()
    : url;

  const name =
    filename ||
    decodeURIComponent(
      basename(new URL(resolved).pathname)
    ) ||
    `telechargement-${Date.now()}`;

  const safeName = safeDownloadName(name);

  const binaryExt =
    [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".7z", ".gz", ".docx", ".xlsx"]
      .includes(extname(safeName).toLowerCase());

  if (binaryExt && contentType.startsWith("text/html")) {
    const error = new Error(
      "Le serveur a renvoyé une page HTML (connexion expirée, erreur ou anti-bot) " +
      "au lieu du fichier. La session doit peut-être être rafraîchie : " +
      "relance avec browser: true pour te reconnecter dans Chrome."
    );

    error.code = "INVALID_DOWNLOAD";

    throw error;
  }

  const contentLength = Number(
    parseHeader(probe.stdout, "content-length") || 0
  );

  if (contentLength > hardCap()) {
    throw new Error(
      `Fichier trop volumineux (${contentLength} octets) : dépasse le plafond.`
    );
  }

  const dir = downloadTargetFolder(folder);

  const target = join(dir, safeName);

  const big =
    contentLength > bigThreshold() ||
    contentLength === 0;

  if (big && confirmed !== true) {
    throw new Error(
      "Téléchargement volumineux ou taille inconnue : demande confirmation explicite à l'utilisateur puis relance avec confirmed: true."
    );
  }

  if (existsSync(target) && confirmed !== true) {
    throw new Error(
      `Le fichier ${safeName} existe déjà : demande confirmation pour l'écraser (confirmed: true).`
    );
  }

  try {
    await execFileAsync(
      "curl",
      [
        "-sL",
        "--compressed",
        "-A", "NEXUS/1.0",
        "-b", jar,
        "--max-time", "120",
        "--max-filesize", String(hardCap()),
        ...(headers.referer ? ["-e", headers.referer] : []),
        "-o", target,
        url,
      ],
      { maxBuffer: 1024 * 1024 }
    );
  } catch (error) {
    removeFileQuietly(target);

    throw error;
  }

  return finalizeDownload({
    target,
    name: safeName,
    folder: dir,
    url,
  });
}