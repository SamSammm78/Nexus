import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

import {
  resolveRoot,
  defaultDownloadDir,
} from "./settings.js";
import {
  isVisualMime,
  detectVisualMime,
  MAX_INLINE_BYTES,
} from "../../utils/fs.js";

const MAX_DEPTH = 6;
const MAX_READ_CHARS = 300_000;
const DOWNLOAD_ALIASES = [
  "downloads",
  "téléchargements",
  "telechargements",
];
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".pdf", ".zip", ".tar", ".gz", ".7z",
  ".mp3", ".mp4", ".mov", ".avi", ".mkv",
  ".bin", ".exe", ".dmg", ".iso", ".db",
  ".xlsx", ".docx", ".pptx",
]);

function isBinary(name) {
  const lower = name.toLowerCase();

  for (const ext of BINARY_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }

  return false;
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }
}

function toEntry(
  fullPath,
  entry,
  relativeBase
) {
  const name =
    entry.name;

  let size = null;
  let mtime = null;

  try {
    const stats = entry.isSymbolicLink()
      ? statSync(fullPath)
      : lstatSync(fullPath);

    size = stats.size ?? null;
    mtime = stats.isDirectory()
      ? null
      : stats.mtime?.toISOString() ?? null;
  } catch {
    // Fichier inaccessible → champs vides.
  }

  return {
    name,
    path: fullPath,
    folder: relativeBase || null,
    isDir: entry.isDirectory(),
    size,
    mtime,
  };
}

export function searchLocalFiles({
  query = "",
  root,
  folder,
  limit = 20,
  maxDepth = MAX_DEPTH,
} = {}) {
  const baseRoot =
    folder
      ? resolveFolderPath(folder)
      : (root
          ? resolve(root)
          : resolveRoot());

  if (!existsSync(baseRoot)) {
    return [];
  }

  const needle =
    query.toLowerCase();

  const depth = Math.max(1, maxDepth);

  const results = [];

  function walk(current, level) {
    if (results.length >= limit) {
      return;
    }

    const currentBase =
      folder
        ? baseRoot
        : current;

    const entries =
      safeReadDir(current);

    for (const entry of entries) {
      if (results.length >= limit) {
        return;
      }

      const fullPath =
        join(current, entry.name);

      const nameMatches =
        !query ||
        entry.name.toLowerCase().includes(needle);

      if (nameMatches) {
        const relativeBase =
          folder
            ? currentBase
            : baseRoot;

        const rel =
          current === relativeBase
            ? null
            : relative(relativeBase, current) || null;

        results.push(
          toEntry(
            fullPath,
            entry,
            rel
          )
        );
      }

      if (
        entry.isDirectory() &&
        level < depth
      ) {
        walk(fullPath, level + 1);
      }
    }
  }

  walk(baseRoot, 1);

  return results;
}

function resolveFolderPath(target) {
  if (isAbsolute(target)) {
    return resolve(target);
  }

  const root = resolveRoot();

  const underRoot =
    resolve(join(root, target));

  // Alias : 'downloads' / 'téléchargements' → dossier de
  // téléchargement réel (~/Downloads), toujours prioritaire.
  const lower = target.toLowerCase();

  for (const alias of DOWNLOAD_ALIASES) {
    if (lower === alias) {
      return defaultDownloadDir();
    }

    if (lower.startsWith(alias + "/")) {
      return resolve(
        join(
          defaultDownloadDir(),
          target.slice(alias.length + 1)
        )
      );
    }
  }

  return underRoot;
}

export function listLocalFolder({
  folder,
  root,
  limit = 50,
} = {}) {
  const target =
    folder
      ? resolveFolderPath(folder)
      : (root
          ? resolve(root)
          : resolveRoot());

  if (!existsSync(target)) {
    return {
      path: target,
      absent: true,
      count: 0,
      dirs: 0,
      files: 0,
      totalSize: 0,
      entries: [],
    };
  }

  const items = safeReadDir(target)
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) =>
      toEntry(
        join(target, entry.name),
        entry,
        null
      )
    );

  const dirs = items
    .filter((item) => item.isDir)
    .length;

  const totalSize = items.reduce(
    (sum, item) => sum + (item.size ?? 0),
    0
  );

  return {
    path: target,
    absent: false,
    count: items.length,
    dirs,
    files: items.length - dirs,
    totalSize,
    entries: items.slice(0, limit),
  };
}

export function readLocalFile(path, {
  maxChars = MAX_READ_CHARS,
} = {}) {
  const fullPath =
    isAbsolute(path)
      ? resolve(path)
      : resolveFolderPath(path);

  if (!existsSync(fullPath)) {
    return null;
  }

  const stats = lstatSync(fullPath);

  if (stats.isDirectory()) {
    return {
      isDir: true,
      ...listLocalFolder({
        root: fullPath,
      }),
    };
  }

  if (isBinary(fullPath.split("/").pop())) {
    if (!isVisualMime(detectVisualMime(fullPath))) {
      return {
        binary: true,
        size: stats.size,
      };
    }

    if (stats.size > MAX_INLINE_BYTES) {
      return {
        binary: true,
        mimeType: detectVisualMime(fullPath),
        size: stats.size,
        tooLarge: true,
      };
    }

    const data = readFileSync(fullPath);

    return {
      binary: true,
      name: fullPath.split("/").pop(),
      mimeType: detectVisualMime(fullPath),
      size: stats.size,
      base64: data.toString("base64"),
    };
  }

  const buffer = readFileSync(fullPath, "utf8");

  const text = buffer.length > maxChars
    ? buffer.slice(0, maxChars)
    : buffer;

  return {
    path: fullPath,
    size: stats.size,
    truncated: buffer.length > maxChars,
    text,
  };
}

export function resolveLocalPath(targetPath) {
  return isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolveFolderPath(targetPath);
}

export function localFileExists(targetPath) {
  return existsSync(resolveLocalPath(targetPath));
}

export function moveLocalFile(
  sourcePath,
  targetPath,
  { confirmed = false } = {}
) {
  if (!sourcePath || !targetPath) {
    throw new Error(
      "Chemin source et destination requis."
    );
  }

  const from = resolveLocalPath(sourcePath);
  let to = resolveLocalPath(targetPath);

  if (!existsSync(from)) {
    throw new Error(
      `Fichier ou dossier introuvable : ${from}`
    );
  }

  // Destination = dossier existant → on déplace DANS ce dossier
  // en conservant le nom du fichier.
  if (existsSync(to) && lstatSync(to).isDirectory()) {
    to = join(
      to,
      from.split("/").pop()
    );
  }

  if (resolve(from) === resolve(to)) {
    throw new Error(
      "Source et destination sont identiques : rien à déplacer."
    );
  }

  if (existsSync(to) && confirmed !== true) {
    throw new Error(
      `Un fichier ou dossier existe déjà à la destination (${to}) : demande confirmation explicite puis relance avec confirmed: true pour l'écraser.`
    );
  }

  const targetExisted = existsSync(to);

  mkdirSync(dirname(to), { recursive: true });

  try {
    renameSync(from, to);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }

    // Volume différent : copie puis suppression de l'original.
    if (existsSync(to)) {
      rmSync(to, { recursive: true, force: true });
    }

    cpSync(from, to, { recursive: true });

    rmSync(from, { recursive: true, force: true });
  }

  const stats = statSync(to);

  return {
    from,
    to: resolve(to),
    moved: true,
    size: stats.isDirectory() ? null : stats.size,
    isDir: stats.isDirectory(),
    overwritten: targetExisted,
  };
}

export function createLocalFolder(targetPath) {
  const fullPath = resolveLocalPath(targetPath);

  mkdirSync(fullPath, { recursive: true });

  return {
    path: fullPath,
    created: true,
  };
}

export function writeLocalFile(targetPath, content) {
  const fullPath = resolveLocalPath(targetPath);

  const existed = existsSync(fullPath);

  if (existed && lstatSync(fullPath).isDirectory()) {
    throw new Error(
      `${fullPath} est un dossier, pas un fichier.`
    );
  }

  mkdirSync(dirname(fullPath), { recursive: true });

  writeFileSync(fullPath, content, "utf8");

  return {
    path: fullPath,
    size: statSync(fullPath).size,
    created: !existed,
    overwritten: existed,
  };
}