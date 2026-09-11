import { google } from "googleapis";

import { getGoogleAuth } from "./auth.js";
import {
  isVisualMime,
  MAX_INLINE_BYTES,
} from "../../utils/fs.js";

const TEXT_MIME = "text/plain";
const MAX_READ_CHARS = 300_000;

const GOOGLE_NATIVE_PREFIX =
  "application/vnd.google-apps.";

async function getDriveClient() {
  const auth = await getGoogleAuth();

  return google.drive({
    version: "v3",
    auth,
  });
}

function formatFile(file) {
  return {
    fileId: file.id,
    name: file.name ?? null,
    mimeType: file.mimeType ?? null,
    isDir: file.mimeType === "application/vnd.google-apps.folder",
    parentId: file.parents?.[0] ?? null,
    size: file.size
      ? Number(file.size)
      : null,
    createdTime: file.createdTime ?? null,
    modifiedTime: file.modifiedTime ?? null,
    webLink: file.webViewLink ?? null,
  };
}

const FIELDS =
  "files(id,name,mimeType,parents,size,createdTime,modifiedTime,webViewLink)";

export async function searchDriveFiles({
  query = "",
  limit = 20,
} = {}) {
  const drive = await getDriveClient();

  const clauses = ["trashed = false"];

  if (query.trim()) {
    clauses.push(
      `name contains '${query.replace(/'/g, "\\'")}'`
    );
  }

  const response = await drive.files.list({
    q: clauses.join(" and "),
    pageSize: Math.max(1, Math.min(limit, 100)),
    fields: FIELDS,
    orderBy: "modifiedTime desc",
  });

  return (
    response.data.files ?? []
  ).map(formatFile);
}

export async function listDriveFolder({
  folderId = "root",
  limit = 50,
} = {}) {
  const drive = await getDriveClient();

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: Math.max(1, Math.min(limit, 100)),
    fields: FIELDS,
    orderBy: "modifiedTime desc",
  });

  return (
    response.data.files ?? []
  ).map(formatFile);
}

export async function readDriveFile(fileId, {
  mimeType,
} = {}) {
  const drive = await getDriveClient();

  const resolvedMime =
    mimeType ??
    (async () => {
      const meta = await drive.files.get({
        fileId,
        fields: "id,mimeType,size",
      });

      return {
        mimeType: meta.data.mimeType,
        size: meta.data.size
          ? Number(meta.data.size)
          : null,
      };
    })();

  const finalMeta = typeof resolvedMime === "string"
    ? { mimeType: resolvedMime, size: null }
    : await resolvedMime;

  const { mimeType: finalMime, size } = finalMeta;

  const isNative =
    finalMime?.startsWith(GOOGLE_NATIVE_PREFIX);

  if (!isNative && isVisualMime(finalMime)) {
    if (size && size > MAX_INLINE_BYTES) {
      return {
        fileId,
        mimeType: finalMime,
        binary: true,
        size,
        tooLarge: true,
      };
    }

    const media = await drive.files.get({
      fileId,
      alt: "media",
    });

    const buffer =
      media.data &&
      typeof media.data !== "string"
        ? media.data
        : Buffer.from(media.data ?? "");

    return {
      fileId,
      mimeType: finalMime,
      binary: true,
      size: buffer.length,
      base64: buffer.toString("base64"),
    };
  }

  let data;

  if (isNative) {
    const exportResponse = await drive.files.export({
      fileId,
      mimeType: TEXT_MIME,
    });

    data = exportResponse.data;
  } else {
    const media = await drive.files.get({
      fileId,
      alt: "media",
    });

    data =
      media.data &&
      typeof media.data !== "string"
        ? media.data.toString("utf8")
        : media.data;
  }

  const raw = typeof data === "string"
    ? data
    : String(data ?? "");

  const isBinaryLike =
    finalMime &&
    !finalMime.startsWith("text/") &&
    !finalMime.includes("json") &&
    !finalMime.includes("xml") &&
    !isNative;

  if (isBinaryLike) {
    return {
      fileId,
      mimeType: finalMime,
      binary: true,
      size: Buffer.byteLength(raw),
    };
  }

  return {
    fileId,
    mimeType: finalMime,
    truncated: raw.length > MAX_READ_CHARS,
    text: raw.slice(0, MAX_READ_CHARS),
  };
}