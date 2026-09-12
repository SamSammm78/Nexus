import { Type } from "@google/genai";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  callMcpTool,
} from "../mcp/client.js";


const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 120_000;
const POLL_INTERVAL = 300;

// Fichiers annexes écrits par Playwright MCP dans son dossier de travail.
const ARTIFACT_PREFIXES = [
  "console-",
  "page-",
  "trace-",
];


// ============================================================
// HELPERS
// ============================================================

export function getNexusDownloadDir() {
  const dir = path.join(
    os.homedir(),
    "Downloads",
    "NEXUS"
  );

  fs.mkdirSync(dir, { recursive: true });

  return dir;
}


function getMcpDownloadsDir() {
  return path.join(
    process.cwd(),
    ".playwright-mcp"
  );
}


export function sanitizeFilename(raw) {
  if (
    typeof raw !== "string" ||
    !raw.trim()
  ) {
    return null;
  }

  let name = raw.replace(/[/\\]+/g, "_");

  name = path.basename(name);

  name = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (
    !name ||
    name === "." ||
    name === ".." ||
    /^\.+$/.test(name)
  ) {
    return null;
  }

  return name;
}


export function getUniqueFilename(dir, filename) {
  const ext = path.extname(filename);
  const base = filename.slice(
    0,
    filename.length - ext.length
  );

  let candidate = filename;
  let index = 1;

  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${index})${ext}`;
    index++;
  }

  return candidate;
}


function snapshotDir(dir) {
  const before = new Map();

  if (!fs.existsSync(dir)) {
    return before;
  }

  for (const entry of fs.readdirSync(dir)) {
    if (ARTIFACT_PREFIXES.some(prefix => entry.startsWith(prefix))) {
      continue;
    }

    const full = path.join(dir, entry);

    let stat;

    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    before.set(entry, {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }

  return before;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function pollForDownload(dir, before, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const now = snapshotDir(dir);

    const candidates = [];

    for (const [name, stat] of now) {
      const previous = before.get(name);

      const isNew = !previous;
      const changed =
        previous &&
        (previous.size !== stat.size ||
          previous.mtimeMs !== stat.mtimeMs);

      if (isNew || changed) {
        candidates.push({
          name,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }

    if (candidates.length) {
      const candidate = candidates.sort(
        (a, b) => b.mtimeMs - a.mtimeMs
      )[0];

      // Stabilité : attendre que la taille se stabilise
      // (téléchargement en cours sur un nom déjà présent).
      await sleep(POLL_INTERVAL);

      const stable = snapshotDir(dir).get(candidate.name);

      if (
        stable &&
        stable.size === candidate.size &&
        stable.mtimeMs === candidate.mtimeMs
      ) {
        return candidate;
      }
    }

    await sleep(POLL_INTERVAL);
  }

  return null;
}


export function extractRefForText(snapshotText, text) {
  if (!snapshotText || !text) {
    return null;
  }

  const raw = String(text);

  const forms = [
    raw,
    raw.toLowerCase(),
    raw.toUpperCase(),
  ];

  const candidates = new Set([
    raw.toLowerCase(),
  ]);

  for (const form of forms) {
    try {
      candidates.add(
        new TextDecoder("windows-1252")
          .decode(Buffer.from(form, "utf8"))
          .toLowerCase()
      );
    } catch {
      // ignore
    }
  }

  for (const line of snapshotText.split("\n")) {
    const current = line.toLowerCase();

    if ([...candidates].some(candidate => current.includes(candidate))) {
      const match = line.match(/\[ref=([a-z0-9]+)\]/);

      if (match) {
        return match[1];
      }
    }
  }

  return null;
}


export function isNoActivePage(snapshotText) {
  if (!snapshotText) {
    return true;
  }

  return (
    /Page URL: about:blank/.test(snapshotText) &&
    !/\[ref=/.test(snapshotText)
  );
}


// ============================================================
// TOOL
// ============================================================

const download_fileTool = {
  declaration: {
    name: "download_file",
    description:
      "Télécharge un fichier depuis la page web actuellement ouverte en cliquant sur l'élément qui déclenche le téléchargement (bouton « Télécharger », lien de téléchargement...). Utilise cet outil quand l'utilisateur demande de télécharger, récupérer ou enregistrer localement un fichier disponible sur une page web. Le fichier est enregistré dans ~/Downloads/NEXUS sans écraser un fichier existant (facture (1).pdf en cas de doublon). Nécessite une page web déjà ouverte : naviguer d'abord avec browser_navigate puis observer la page (browser_snapshot) pour obtenir un ref.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ref: {
          type: Type.STRING,
          description:
            "Référence Playwright de l'élément à cliquer (ex: 'e42'), issue du dernier browser_snapshot. Priorité 1.",
        },
        selector: {
          type: Type.STRING,
          description:
            "Sélecteur de l'élément à cliquer si aucun ref n'est disponible (ex: 'a.download-button'). Priorité 2.",
        },
        text: {
          type: Type.STRING,
          description:
            "Texte visible du bouton ou lien à cliquer (ex: 'Télécharger', 'Download', 'facture septembre'), utilisé en dernier recours. Priorité 3.",
        },
        filename: {
          type: Type.STRING,
          description:
            "Nom optionnel à donner au fichier (ex: 'facture-septembre.pdf'). Par défaut, le nom proposé par le site est conservé. Un chemin n'est jamais accepté.",
        },
        timeout: {
          type: Type.NUMBER,
          description:
            "Timeout optionnel du téléchargement en millisecondes (défaut 60000, maximum 120000).",
        },
      },
    },
  },

  async execute(args = {}) {
    const timeout = Math.min(
      Math.max(
        Number(args.timeout) || DEFAULT_TIMEOUT,
        5_000
      ),
      MAX_TIMEOUT
    );

    // --------------------------------------------------------
    // Page active ?
    // --------------------------------------------------------

    const snapshot = await runMcpSafe(
      "browser_snapshot",
      {}
    );

    if (!snapshot) {
      return downloadError(
        "DOWNLOAD_FAILED",
        "Le navigateur est indisponible."
      );
    }

    if (snapshot.isError) {
      return downloadError(
        "DOWNLOAD_FAILED",
        snapshot.message
      );
    }

    if (isNoActivePage(snapshot.text)) {
      return downloadError(
        "NO_ACTIVE_PAGE",
        "Aucune page ouverte. Navigue d'abord vers le site avec browser_navigate, puis observe la page avec browser_snapshot avant de réessayer."
      );
    }

    // --------------------------------------------------------
    // Résolution de l'élément : ref > selector > text
    // --------------------------------------------------------

    let target;

    if (args.ref) {
      target = String(args.ref);
    } else if (args.selector) {
      target = String(args.selector);
    } else if (args.text) {
      target = extractRefForText(
        snapshot.text,
        args.text
      );

      if (!target) {
        return downloadError(
          "ELEMENT_NOT_FOUND",
          `Aucun élément ne correspond au texte « ${args.text} » dans la page actuelle.`
        );
      }
    } else {
      return downloadError(
        "ELEMENT_NOT_FOUND",
        "Précisez au moins une méthode d'identification : ref, selector ou text."
      );
    }

    // --------------------------------------------------------
    // Clic qui déclenche le téléchargement
    // --------------------------------------------------------

    const mcpDir = getMcpDownloadsDir();
    const before = snapshotDir(mcpDir);

    console.log(
      `[NEXUS Browser] Démarrage du téléchargement (cible : ${target})...`
    );

    const click = await runMcpSafe(
      "browser_click",
      { target }
    );

    if (!click || click.isError) {
      if (click?.isError && click.message) {
        if (/not found|introuvable|strict mode|does not match/i.test(click.message)) {
          return downloadError(
            "ELEMENT_NOT_FOUND",
            `${click.message} Reprends un browser_snapshot récent puis réessaie.`
          );
        }

        if (/download|cancel/i.test(click.message)) {
          return downloadError(
            "DOWNLOAD_CANCELLED",
            click.message
          );
        }
      }

      return downloadError(
        "DOWNLOAD_FAILED",
        click?.isError
          ? click.message
          : "Le clic sur l'élément a échoué."
      );
    }

    // --------------------------------------------------------
    // Attente réelle de la fin du téléchargement
    // --------------------------------------------------------

    const download = await pollForDownload(
      mcpDir,
      before,
      timeout
    );

    if (!download) {
      return downloadError(
        "DOWNLOAD_TIMEOUT",
        `Aucun fichier téléchargé après ${timeout} ms : le clic n'a pas déclenché de téléchargement, ou le téléchargement a pris trop de temps.`
      );
    }

    console.log(
      `[NEXUS Browser] Téléchargement détecté : ${download.name}`
    );

    // --------------------------------------------------------
    // Destination finale (~/Downloads/NEXUS)
    // --------------------------------------------------------

    let finalName = sanitizeFilename(download.name);

    if (args.filename) {
      const customName = sanitizeFilename(args.filename);

      if (!customName) {
        return downloadError(
          "INVALID_FILENAME",
          `Le nom de fichier fourni est invalide : « ${args.filename} ».`
        );
      }

      if (
        finalName &&
        !path.extname(customName) &&
        path.extname(finalName)
      ) {
        finalName = customName + path.extname(finalName);
      } else {
        finalName = customName;
      }
    }

    if (!finalName) {
      return downloadError(
        "DOWNLOAD_FAILED",
        "Le nom du fichier téléchargé est invalide."
      );
    }

    const destDir = getNexusDownloadDir();
    const destName = getUniqueFilename(destDir, finalName);
    const source = path.join(mcpDir, download.name);
    const dest = path.join(destDir, destName);

    try {
      fs.renameSync(source, dest);
    } catch {
      fs.copyFileSync(source, dest);
      fs.unlinkSync(source);
    }

    const size = fs.statSync(dest).size;

    console.log(
      `[NEXUS Browser] Téléchargement enregistré : ${dest}`
    );

    return {
      success: true,
      filename: destName,
      path: dest,
      extension: path.extname(destName),
      size,
      message: "Fichier téléchargé avec succès.",
    };
  },
};

export const downloadTools = [
  download_fileTool,
];


// ============================================================
// INTERNAL
// ============================================================

async function runMcpSafe(toolName, args) {
  try {
    const response = await callMcpTool(
      "playwright",
      toolName,
      args
    );

    return {
      isError: !!response.isError,
      text: response.content?.[0]?.text ?? "",
      message: response.content?.[0]?.text ?? "",
    };
  } catch (error) {
    return {
      isError: true,
      message:
        error?.message ??
        String(error),
    };
  }
}


function downloadError(error, message) {
  console.log(
    `[NEXUS Browser] Échec du téléchargement : ${message}`
  );

  return {
    success: false,
    error,
    message,
  };
}