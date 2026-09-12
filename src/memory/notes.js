import {
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
  mkdirSync,
  renameSync,
} from "node:fs";

import {
  join,
  resolve,
  basename,
  dirname,
} from "node:path";

import {
  fileURLToPath,
} from "node:url";


const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const META_KEYS = [
  "id",
  "title",
  "type",
  "project",
  "importance",
  "confidence",
  "tags",
  "created",
  "updated",
  "parent",
  "relations",
  "status",
  "goal",
  "milestones",
  "nextAction",
  "lastCheckpoint",
  "label",
  "address",
  "latitude",
  "longitude",
];

const STOP_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "d", "l",
  "sur", "dans", "pour", "avec", "sans", "par", "en", "au", "aux",
  "et", "ou", "mais", "donc", "que", "qui", "est", "the", "a", "an",
  "of", "and", "or", "to", "in", "on", "at", "this", "that",
]);

const PROJECTS_FOLDER = "projets";
const ARCHIVES_FOLDER = "archives";


export function getNoteDir() {
  const env = process.env.NEXUS_VAULT?.trim();

  if (env) {
    return resolve(env);
  }

  const projectRoot = fileURLToPath(
    new URL("../../", import.meta.url)
  );

  return join(projectRoot, "memories");
}


export function writeNote(note) {
  const dir = getNoteDir();

  const now = new Date().toISOString();

  const meta = {
    id: note.id ?? generateId(),
    title: note.title ?? deriveTitle(note.content),
    type: note.type ?? "fact",
    project: note.projectId ?? "",
    importance: note.importance ?? 0.5,
    confidence: note.confidence ?? 1,
    tags: (note.tags ?? []).join(", "),
    created: note.created ?? now,
    updated: now,
    parent: note.parent ?? "",
    relations: (note.relations ?? []).join(", "),
    status: note.status ?? "",
    goal: note.goal ?? "",
    milestones: note.milestones ?? "",
    nextAction: note.nextAction ?? "",
    lastCheckpoint: note.lastCheckpoint ?? "",
    label: note.label ?? "",
    address: note.address ?? "",
    latitude: note.latitude ?? "",
    longitude: note.longitude ?? "",
  };

  const content = String(note.content ?? "").trim();

  let targetFile = null;

  if (note.id) {
    targetFile = findNoteFile(note.id);
  }

  const folder =
    note.type === "project"
      ? PROJECTS_FOLDER
      : "";

  let fileName = buildFileName(meta, folder);

  if (targetFile && basename(targetFile) !== fileName) {
    fileName = disambiguate(dir, fileName, { except: targetFile });
  }

  const file = join(
    dir,
    folder,
    fileName
  );

  if (folder) {
    mkdirSync(
      join(dir, folder),
      { recursive: true }
    );
  }

  const body = composeNote(meta, content);

  writeFileSync(file, body, "utf8");

  if (note.id) {
    const previous = findNoteFile(note.id);

    if (previous && previous !== file) {
      try {
        unlinkSync(previous);
      } catch {
        // L'ancien fichier n'existe peut-être plus.
      }
    }
  }

  return {
    id: meta.id,
    title: meta.title,
    file,
    folder,
    type: meta.type,
    projectId: meta.project || null,
    importance: meta.importance,
    confidence: meta.confidence,
    tags: meta.tags,
    content,
    created: meta.created,
    updated: meta.updated,
    parent: meta.parent || null,
    relations: meta.relations || [],
    status: meta.status || null,
    goal: meta.goal || null,
    milestones: meta.milestones || null,
    nextAction: meta.nextAction || null,
    lastCheckpoint: meta.lastCheckpoint || null,
    label: meta.label || null,
    address: meta.address || null,
    latitude: meta.latitude || null,
    longitude: meta.longitude || null,
  };
}


export function readNote(file) {
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = parseNote(raw);

    if (!parsed) return null;

    return {
      id: parsed.meta.id || basename(file, ".md"),
      title: parsed.meta.title,
      file,
      folder: getFolder(file),
      type: parsed.meta.type ?? "fact",
      projectId: parsed.meta.project ? String(parsed.meta.project) : null,
      importance: parsed.meta.importance ?? 0.5,
      confidence: parsed.meta.confidence ?? 1,
      tags: parsed.meta.tags,
      content: parsed.content,
      created: parsed.meta.created ?? null,
      updated: parsed.meta.updated ?? null,
      parent: parsed.meta.parent ?? null,
      relations: parsed.meta.relations ?? [],
      status: parsed.meta.status ?? null,
      goal: parsed.meta.goal ?? null,
      milestones: parsed.meta.milestones ?? null,
      nextAction: parsed.meta.nextAction ?? null,
      lastCheckpoint: parsed.meta.lastCheckpoint ?? null,
      label: parsed.meta.label ?? null,
      address: parsed.meta.address ?? null,
      latitude: parsed.meta.latitude ?? null,
      longitude: parsed.meta.longitude ?? null,
    };
  } catch {
    return null;
  }
}


export function deleteNote(file) {
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}


export function findNoteFile(id) {
  return listNoteFiles({ max: 5000 }).find(
    file => {
      const note = readNote(file);
      return note && note.id === id;
    }
  );
}


export function listNoteFiles({
  max = 500,
} = {}) {
  const dir = getNoteDir();
  const files = collectMarkdownFiles(dir, max);

  files.sort(
    (a, b) =>
      basename(b).localeCompare(basename(a))
  );

  return files;
}


export function getArchivesDir() {
  return join(getNoteDir(), ARCHIVES_FOLDER);
}


export function listArchivedNoteFiles({
  max = 500,
} = {}) {
  const files = collectMarkdownFiles(
    getArchivesDir(),
    max
  );

  files.sort(
    (a, b) =>
      basename(b).localeCompare(basename(a))
  );

  return files;
}


export function archiveNote(file) {
  const dir = getArchivesDir();

  try {
    mkdirSync(dir, { recursive: true });

    const destination = join(dir, basename(file));

    renameSync(file, destination);

    return destination;
  } catch {
    return null;
  }
}


export function unarchiveNote(file) {
  try {
    const destination = join(
      getNoteDir(),
      basename(file)
    );

    renameSync(file, destination);

    return destination;
  } catch {
    return null;
  }
}


export function deriveTitle(content) {
  const cleaned = String(content ?? "")
    .replace(/^["'«»\s-]+|["'«»\s-]+$/g, "")
    .trim();

  const [first] = cleaned.split(/[\n\r]/);

  const words = first
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 8) ?? [];

  if (!words.length) return "Note sans titre";

  const title = words.join(" ");

  return title.charAt(0).toUpperCase() + title.slice(1);
}


export function slugifyTitle(title) {
  const slug = String(title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
    .slice(0, 5)
    .join("-");

  return slug || "note";
}


function getFolder(file) {
  return dirname(file).endsWith(PROJECTS_FOLDER)
    ? PROJECTS_FOLDER
    : "";
}


function collectMarkdownFiles(dir, max) {
  let entries;

  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    if (files.length >= max) break;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ARCHIVES_FOLDER) continue;

      files.push(...collectMarkdownFiles(full, max));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      !entry.name.startsWith("_")
    ) {
      files.push(full);
    }
  }

  return files;
}


function buildFileName(meta, folder) {
  const slug = slugifyTitle(meta.title);

  if (folder === PROJECTS_FOLDER) {
    return `${slug}.md`;
  }

  const date = String(meta.created ?? "")
    .slice(0, 10);

  return `${date}-${slug}.md`;
}


function disambiguate(dir, fileName, { except = null } = {}) {
  const name = basename(fileName, ".md");

  let counter = 2;
  let candidate;

  do {
    candidate = join(dir, `${name}-${counter}.md`);

    if (exists(candidate) && candidate !== except) {
      counter++;
      continue;
    }

    return basename(candidate);
  } while (counter < 100);

  return basename(candidate);
}


function exists(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}


function composeNote(meta, content) {
  const links = [];

  if (meta.project && meta.type !== "project") {
    const hubSlug = slugifyTitle(
      meta.projectName ?? meta.project
    );

    const hubFile = exists(
      join(
        getNoteDir(),
        PROJECTS_FOLDER,
        `${hubSlug}.md`
      )
    );

    if (hubFile) {
      links.push(
        `- [[${PROJECTS_FOLDER}/${hubSlug}]]`
      );
    }
  }

  if (meta.parent) {
    const parentFile = findNoteFile(meta.parent);
    const parentNote = parentFile
      ? readNote(parentFile)
      : null;

    if (parentNote) {
      links.push(`- ↑ [[${basename(parentNote.file, ".md")}]]`);
    }
  }

  const relations =
    Array.isArray(meta.relations)
      ? meta.relations
      : String(meta.relations ?? "")
          .split(",")
          .map(relation => relation.trim())
          .filter(Boolean);

  for (const id of relations) {
    if (id === meta.id) continue;

    const relationFile = findNoteFile(id);

    if (!relationFile) continue;

    const base = basename(
      relationFile,
      ".md"
    );

    if (links.some(link =>
      link.includes(base)
    )) {
      continue;
    }

    links.push(`- ↔ [[${base}]]`);
  }

  const lines = [
    "---",
    ...META_KEYS
      .filter(key => meta[key] !== undefined && meta[key] !== "")
      .map(key => `${key}: ${formatValue(meta[key])}`),
    "---",
    "",
    content,
  ];

  if (links.length) {
    lines.push(
      "",
      "**Connexions :**",
      ...links
    );
  }

  return lines.join("\n") + "\n";
}


function formatValue(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return String(value);
}


function parseNote(raw) {
  const match = FRONTMATTER_RE.exec(raw);

  if (!match) return null;

  const meta = parseFrontmatter(match[1]);
  const content = (match[2] ?? "")
    .replace(/\n+\*\*Connexions\s*:\*\*[\s\S]*$/, "")
    .trim();

  if (!meta.id && !content) return null;

  meta.tags = String(meta.tags ?? "")
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);

  meta.relations = String(meta.relations ?? "")
    .split(",")
    .map(relation => relation.trim())
    .filter(Boolean);

  return { meta, content };
}


function parseFrontmatter(block) {
  const meta = {};

  for (const line of block.split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);

    if (!match) continue;

    meta[match[1]] = parseScalar(match[2]);
  }

  return meta;
}


function parseScalar(value) {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}


function generateId() {
  const date = new Date().toISOString().slice(0, 10);

  return `${date.slice(0, 7)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}