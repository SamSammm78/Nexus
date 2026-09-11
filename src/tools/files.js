import { Type } from "@google/genai";

import {
  searchLocalFiles,
  listLocalFolder,
  readLocalFile,
  writeLocalFile,
  createLocalFolder,
  localFileExists,
} from "../services/files/local.js";

import {
  searchDriveFiles,
  listDriveFolder,
  readDriveFile,
} from "../services/google/drive.js";

import {
  getFilesSettings,
} from "../services/files/settings.js";

import {
  downloadUrl,
} from "../services/files/download.js";


const STRING = Type.STRING;
const NUMBER = Type.NUMBER;

const SOURCES = ["auto", "local", "drive"];

const sourceParameter = {
  type: STRING,
  enum: SOURCES,
  description:
    "Source des fichiers : auto (source prioritaire configurée, repli sur l'autre), local (disque) ou drive (Google Drive). Défaut : auto.",
};

const limitParameter = {
  type: NUMBER,
  description:
    "Nombre maximum de résultats (défaut 20).",
};


function priorityOrder() {
  const { sourcePriority } = getFilesSettings();

  return sourcePriority === "drive"
    ? ["drive", "local"]
    : ["local", "drive"];
}


function normalizeSources(source) {
  if (source && source !== "auto") {
    if (!SOURCES.includes(source)) {
      throw new Error(
        `Source invalide : ${source} (auto, local, drive)`
      );
    }

    return [source];
  }

  return priorityOrder();
}


function tagResults(results, source) {
  return results.map((item) => ({
    ...item,
    source,
  }));
}


async function searchOneSource(source, args) {
  if (source === "local") {
    return tagResults(
      searchLocalFiles({
        query: args.query,
        folder: args.folder,
        limit: args.limit,
      }),
      "local"
    );
  }

  return tagResults(
    await searchDriveFiles({
      query: args.query ?? "",
      limit: args.limit ?? 20,
    }),
    "drive"
  );
}


async function listOneSource(source, args) {
  if (source === "local") {
    return tagResults(
      listLocalFolder({
        folder: args.folder,
        limit: args.limit,
      }),
      "local"
    );
  }

  return tagResults(
    await listDriveFolder({
      folderId: args.folderId ?? "root",
      limit: args.limit ?? 50,
    }),
    "drive"
  );
}


async function readOneSource(source, args) {
  if (source === "local") {
    return readLocalFile(args.path, {
      maxChars: args.maxChars,
    });
  }

  return readDriveFile(args.fileId, {
    mimeType: args.mimeType,
  });
}


const file_searchTool = {
  declaration: {
    name: "file_search",
    description:
      "Recherche des fichiers par nom, dans les fichiers locaux (Documents, cours, TD...) et/ou Google Drive. Source par défaut : la source prioritaire configurée, avec repli automatique sur l'autre.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: STRING,
          description:
            "Mots-clés du nom de fichier recherché (ex: 'TD analyse', 'cours info').",
        },
        source: sourceParameter,
        folder: {
          type: STRING,
          description:
            "Dossier local restrictif (chemin relatif à la racine, ex: 'cours' ou 'TD/math') pour la source locale.",
        },
        limit: limitParameter,
      },
    },
  },

  async execute(args = {}) {
    const results = [];

    for (const source of normalizeSources(args.source)) {
      try {
        const found = await searchOneSource(source, args);

        results.push(...found);

        if (found.length > 0) {
          break;
        }
      } catch {
        // Source indisponible (ex : auth Drive manquante) → on passe à la suivante.
      }
    }

    return results.slice(0, args.limit ?? 20);
  },
};


const file_listTool = {
  declaration: {
    name: "file_list",
    description:
      "Liste le contenu d'un dossier : local (Documents, cours, TD...) et/ou Google Drive. Source par défaut : la source prioritaire configurée.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        source: sourceParameter,
        folder: {
          type: STRING,
          description:
            "Dossier local à lister (chemin relatif à la racine, vide = racine).",
        },
        folderId: {
          type: STRING,
          description:
            "Identifiant Google Drive du dossier (vide = racine « Mon Drive »).",
        },
        limit: limitParameter,
      },
    },
  },

  async execute(args = {}) {
    const results = [];

    const sources = args.folderId
      ? ["drive"]
      : normalizeSources(args.source);

    for (const source of sources) {
      try {
        const found = await listOneSource(source, args);

        results.push(...found);

        if (found.length > 0) {
          break;
        }
      } catch {
        // Source indisponible → on passe à la suivante.
      }
    }

    return results.slice(0, args.limit ?? 50);
  },
};


const file_readTool = {
  declaration: {
    name: "file_read",
    description:
      "Lit le contenu d'un fichier : texte brut (local ou Drive), et joint directement les IMAGES et PDF au modèle pour analyse. Autres binaires signalés sans contenu.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        source: sourceParameter,
        path: {
          type: STRING,
          description:
            "Chemin local du fichier (absolu ou relatif à la racine configurée).",
        },
        fileId: {
          type: STRING,
          description:
            "Identifiant Google Drive du fichier (renvoyé par file_search / file_list).",
        },
        mimeType: {
          type: STRING,
          description:
            "Type MIME du fichier Drive (optionnel, pour éviter une requête supplémentaire).",
        },
        maxChars: {
          type: NUMBER,
          description:
            "Nombre maximal de caractères à lire (défaut 300 000).",
        },
      },
    },
  },

  async execute(args = {}) {
    let sources;

    if (args.fileId) {
      sources = ["drive"];
    } else if (args.path) {
      sources = ["local"];
    } else {
      throw new Error(
        "Précisez un chemin local (path) ou un fichier Drive (fileId)."
      );
    }

    for (const source of sources) {
      try {
        const result = await readOneSource(source, args);

        if (result) {
          return { source, ...result };
        }
      } catch {
        // Source indisponible → on passe à la suivante.
      }
    }

    return null;
  },
};


const file_writeTool = {
  declaration: {
    name: "file_write",
    description:
      "Crée ou écrase un fichier texte dans l'espace de fichiers local (Documents...). L'écrasement d'un fichier existant nécessite une confirmation explicite (confirmed: true).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: STRING,
          description:
            "Chemin du fichier (relatif à la racine ou absolu), ex: 'TD/math/correction.md'.",
        },
        content: {
          type: STRING,
          description:
            "Contenu texte à écrire dans le fichier.",
        },
        confirmed: {
          type: "boolean",
          description:
            "À passer à true uniquement si l'utilisateur a explicitement confirmé l'écrasement d'un fichier existant.",
        },
      },
    },
  },

  async execute(args = {}) {
    if (!args.path) {
      throw new Error("Chemin du fichier manquant.");
    }

    if (typeof args.content !== "string") {
      throw new Error("Contenu manquant.");
    }

    if (localFileExists(args.path) && args.confirmed !== true) {
      throw new Error(
        "Le fichier existe déjà : demande confirmation explicite à l'utilisateur puis relance avec confirmed: true pour l'écraser."
      );
    }

    return writeLocalFile(args.path, args.content);
  },
};


const file_mkdirTool = {
  declaration: {
    name: "file_mkdir",
    description:
      "Crée un ou plusieurs dossiers (récursif) dans l'espace de fichiers local (Documents, cours, TD...).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: STRING,
          description:
            "Chemin du dossier à créer (relatif à la racine ou absolu), ex: 'cours/S1/programmation'.",
        },
      },
    },
  },

  async execute(args = {}) {
    if (!args.path) {
      throw new Error("Chemin du dossier manquant.");
    }

    return createLocalFolder(args.path);
  },
};


const file_downloadTool = {
  declaration: {
    name: "file_download",
    description:
      "Télécharge un fichier depuis une URL (HTTP/HTTPS, ex. un document trouvé via le navigateur Playwright) vers l'espace de fichiers local (dossier 'downloads' par défaut). Confirmation requise si le fichier est volumineux ou si un fichier du même nom existe déjà.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: {
          type: STRING,
          description:
            "URL du fichier à télécharger.",
        },
        folder: {
          type: STRING,
          description:
            "Dossier de destination (relatif à la racine ou absolu). Défaut : 'downloads'.",
        },
        filename: {
          type: STRING,
          description:
            "Nom de fichier à enregistrer (défaut : dérivé de l'URL).",
        },
        confirmed: {
          type: "boolean",
          description:
            "À passer à true uniquement si l'utilisateur a explicitement confirmé (écrasement d'un fichier existant ou téléchargement volumineux).",
        },
      },
    },
  },

  async execute(args = {}) {
    return downloadUrl({
      url: args.url,
      folder: args.folder,
      filename: args.filename,
      confirmed: args.confirmed,
    });
  },
};


export const filesTools = [
  file_searchTool,
  file_listTool,
  file_readTool,
  file_writeTool,
  file_mkdirTool,
  file_downloadTool,
];