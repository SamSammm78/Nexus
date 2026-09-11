import {
  statSync,
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