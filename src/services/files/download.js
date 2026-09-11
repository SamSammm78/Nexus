import {
  createWriteStream,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
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
} from "node:path";

import { resolveRoot } from "./settings.js";

export const DEFAULT_DOWNLOAD_FOLDER = "downloads";

const DEFAULT_BIG_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

function bigThreshold() {
  return Number(
    process.env.NEXUS_FILES_DOWNLOAD_BIG ?? DEFAULT_BIG_BYTES
  );
}

function hardCap() {
  return Number(
    process.env.NEXUS_FILES_DOWNLOAD_MAX ?? DEFAULT_MAX_BYTES
  );
}

function targetFolder(folder) {
  const root = resolveRoot();

  const base = folder
    ? isAbsolute(folder)
      ? resolve(folder)
      : resolve(join(root, folder))
    : join(root, DEFAULT_DOWNLOAD_FOLDER);

  mkdirSync(base, { recursive: true });

  return base;
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

  const safeName =
    basename(name).replace(/[/\\]/g, "_") ||
    `telechargement-${Date.now()}`;

  const dir = targetFolder(folder);

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

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(target)
  );

  const size = statSync(target).size;

  return {
    path: target,
    name: safeName,
    folder: dir,
    size,
    url,
  };
}