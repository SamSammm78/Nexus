import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { homedir } from "node:os";

import { resolveRoot } from "./settings.js";

const MAX_DEPTH = 6;
const MAX_READ_CHARS = 300_000;
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
      ? folderFromRoot(folder)
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

function folderFromRoot(folder) {
  const root = resolveRoot();

  if (isAbsolute(folder)) {
    return resolve(folder);
  }

  return resolve(join(root, folder));
}

export function listLocalFolder({
  folder,
  root,
  limit = 50,
} = {}) {
  const target =
    folder
      ? folderFromRoot(folder)
      : (root
          ? resolve(root)
          : resolveRoot());

  if (!existsSync(target)) {
    return [];
  }

  const entries = safeReadDir(target);

  const items = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) =>
      toEntry(
        join(target, entry.name),
        entry,
        null
      )
    );

  return items.slice(0, limit);
}

export function readLocalFile(path, {
  maxChars = MAX_READ_CHARS,
} = {}) {
  const fullPath =
    isAbsolute(path)
      ? resolve(path)
      : resolve(join(resolveRoot(), path));

  if (!existsSync(fullPath)) {
    return null;
  }

  const stats = lstatSync(fullPath);

  if (stats.isDirectory()) {
    return {
      isDir: true,
      entries: listLocalFolder({
        root: fullPath,
      }),
    };
  }

  if (isBinary(fullPath.split("/").pop())) {
    return {
      binary: true,
      size: stats.size,
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