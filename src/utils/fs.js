import {
  statSync,
  openSync,
  readSync,
  closeSync,
  existsSync,
  unlinkSync,
} from "node:fs";

export const VISUAL_MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".pdf": "application/pdf",
};

export const MAX_INLINE_BYTES = 18 * 1024 * 1024;

const MAGIC_BY_EXT = {
  ".pdf": [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  ".png": [0x89, 0x50, 0x4e, 0x47],       // PNG
  ".jpg": [0xff, 0xd8, 0xff],             // JPEG
  ".jpeg": [0xff, 0xd8, 0xff],
  ".gif": [0x47, 0x49, 0x46, 0x38],       // GIF8
  ".webp": [0x52, 0x49, 0x46, 0x46],      // RIFF (WEBP contrôlé après)
  ".zip": [0x50, 0x4b, 0x03, 0x04],       // PK
  ".docx": [0x50, 0x4b, 0x03, 0x04],
  ".xlsx": [0x50, 0x4b, 0x03, 0x04],
  ".mp3": [0x49, 0x44, 0x33],             // ID3
  ".7z": [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
  ".bz2": [0x42, 0x5a, 0x68],
  ".gz": [0x1f, 0x8b],
};

export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isVisualMime(mimeType) {
  if (!mimeType) return false;

  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf"
  );
}

export function detectVisualMime(name) {
  const lower = String(name ?? "")
    .toLowerCase();

  for (const ext of Object.keys(VISUAL_MIME_BY_EXT)) {
    if (lower.endsWith(ext)) {
      return VISUAL_MIME_BY_EXT[ext];
    }
  }

  return null;
}

export function readHead(filePath, length = 16) {
  try {
    const fd = openSync(filePath, "r");
    const buffer = Buffer.alloc(length);

    const read = readSync(fd, buffer, 0, length, 0);

    closeSync(fd);

    return buffer.subarray(0, read);
  } catch {
    return null;
  }
}

export function looksLikeHtml(head) {
  if (!head || head.length < 5) return false;

  const sample = head.slice(0, 512).toString("latin1");

  return (
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.startsWith("<head") ||
    sample.startsWith("<script") ||
    sample.startsWith("<?xml") && sample.includes("<html")
  );
}

export function validateMagic(filePath, name) {
  const lower = String(name ?? "")
    .toLowerCase();

  let signature = null;

  for (const ext of Object.keys(MAGIC_BY_EXT)) {
    if (lower.endsWith(ext)) {
      signature = MAGIC_BY_EXT[ext];
      break;
    }
  }

  if (!signature) {
    return "";
  }

  const head = readHead(filePath, signature.length);

  if (!head || head.length < signature.length) {
    return "Le fichier semble tronqué.";
  }

  const matches =
    head.every((byte, i) => byte === signature[i]);

  if (matches) {
    return "";
  }

  if (lower.endsWith(".pdf") && head.slice(0, 5).toString("latin1").startsWith("%PDF")) {
    return "";
  }

  return (
    `Le contenu ne correspond pas au fichier attendu ({${lower}}). ` +
    (looksLikeHtml(head)
      ? "Le serveur a renvoyé une page HTML (page de connexion, erreur ou anti-bot) au lieu du fichier. "
      : "Le téléchargement est incomplet ou le site a renvoyé autre chose. ") +
    "Essaie de retélécharger avec browser: true pour utiliser la session du navigateur."
  );
}

export function removeFileQuietly(filePath) {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // On ne bloque jamais sur le nettoyage.
  }
}