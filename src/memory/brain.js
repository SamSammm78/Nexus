import {
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";

import {
  join,
} from "node:path";

import {
  getNoteDir,
  readNote,
  writeNote,
  deleteNote,
  findNoteFile,
  listNoteFiles,
  archiveNote,
  unarchiveNote,
  listArchivedNoteFiles,
} from "./notes.js";

import {
  invalidateSemanticIndex,
  semanticSearch,
  semanticNeighbors,
  findDuplicateGroups,
  consolidateDuplicates,
  semanticRelinkMemories,
} from "./semantic.js";


export const MEMORY_TYPES = [
  "fact",
  "decision",
  "preference",
  "event",
  "note",
  "project",
  "checkpoint",
  "place",
];

const MAX_CONTENT = 2000;
const DEFAULT_SCAN_LIMIT = 300;
const MAX_RELATIONS = 4;
const MAX_BACKLINK = 2;

const COMMON_WORDS = new Set([
  "utilisateur",
  "user",
  "nexus",
  "forme",
  "sous",
  "être",
  "avec",
  "deux",
  "mais",
  "aide",
  "bonjour",
  "merci",
  "project",
  "projet",
  "mémoire",
  "memoire",
  "permet",
  "demande",
  "question",
  "réponse",
  "reponse",
  "notification",
  "calculer",
]);

// Pont sémantique léger : un terme de recherche élargit à ses voisins.
const SYNONYMS = {
  etude: ["etudiant", "etudie", "licence", "universite", "ecole", "cursus", "scolarite", "formation"],
  etudes: ["etudiant", "etudie", "licence", "universite", "ecole", "cursus", "scolarite", "formation"],
  etudiant: ["etude", "etudie", "licence", "universite", "ecole", "cursus", "scolarite"],
  ecole: ["etudiant", "etude", "universite", "cursus", "scolarite"],
  universite: ["etudiant", "etude", "ecole", "cursus", "licence", "cergy"],
  formation: ["etude", "etudiant", "cursus", "scolarite"],
  scolarite: ["etude", "etudiant", "ecole", "universite"],
  age: ["naissance", "anniversaire", "ne"],
  naissance: ["age", "anniversaire", "ne"],
  anniversaire: ["naissance", "age"],
  habite: ["adresse", "domicile", "ville", "vit"],
  adresse: ["habite", "domicile", "ville"],
  ville: ["adresse", "habite", "domicile"],
  travail: ["emploi", "metier", "job", "poste", "travaille"],
  emploi: ["travail", "metier", "job", "poste"],
  metier: ["travail", "emploi", "job", "poste"],
};


function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


function expandKeywords(keywords) {
  const expanded = new Set(keywords);

  for (const keyword of keywords) {
    for (const synonym of SYNONYMS[keyword] ?? []) {
      expanded.add(synonym);
    }
  }

  return Array.from(expanded);
}


let initialized = false;


export function initBrain() {
  if (initialized) return getNoteDir();

  const dir = getNoteDir();

  mkdirSync(dir, {
    recursive: true,
  });

  initialized = true;

  return dir;
}


export function rememberMemory({
  type = "fact",
  title,
  content,
  projectId = null,
  importance = 0.5,
  confidence = 1,
  tags = [],
  status,
  goal,
  milestones,
  nextAction,
  lastCheckpoint,
  label,
  address,
  latitude,
  longitude,
} = {}) {
  if (!MEMORY_TYPES.includes(type)) {
    throw new Error(
      `Type de mémoire invalide : ${type}`
    );
  }

  const text = String(content ?? "")
    .trim();

  if (!text) {
    throw new Error(
      "Contenu de mémoire vide."
    );
  }

  const parent =
    type === "event"
      ? findLatestEventId()
      : type === "checkpoint"
        ? findLatestProjectEventId(projectId)
        : null;

  const related = findRelatedNotes({
    text,
    tags,
    projectId,
  });

  const note = writeNote({
    type,
    title,
    content: text.slice(0, MAX_CONTENT),
    projectId,
    importance,
    confidence,
    tags,
    parent,
    relations: related,
    status,
    goal,
    milestones,
    nextAction,
    lastCheckpoint,
    label,
    address,
    latitude,
    longitude,
  });

  backlinkRelations(note.id, related);

  invalidateSemanticIndex();

  return note;
}


export function recallMemories({
  type = null,
  projectId = null,
  keywords = [],
  limit = 10,
} = {}) {
  initBrain();

  const files = listNoteFiles(
    { max: DEFAULT_SCAN_LIMIT }
  );

  const rawKeywords = keywords
    .filter(Boolean)
    .map(keyword => normalize(keyword))
    .filter(Boolean);

  const searchKeywords = expandKeywords(rawKeywords);

  const matches = [];

  for (const file of files) {
    const note = readNote(file);

    if (!note) continue;

    const text = normalize(
      `${note.title ?? ""} ${note.content ?? ""} ` +
      `${(note.tags ?? []).join(" ")}`
    );

    if (type && note.type !== type) continue;
    if (projectId && note.projectId !== projectId) continue;

    let score = note.importance ?? 0.5;

    for (const keyword of searchKeywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    if (
      searchKeywords.length > 0 &&
      score <= (note.importance ?? 0.5)
    ) {
      continue;
    }

    matches.push({
      ...note,
      _score: score,
    });
  }

  matches.sort(
    (a, b) =>
      b._score - a._score ||
      (b.created ?? "").localeCompare(
        a.created ?? ""
      )
  );

  return matches
    .slice(0, limit)
    .map(({ _score, ...note }) => note);
}


export function getMemory(id) {
  const file = findNoteFile(id);

  if (!file) return null;

  return readNote(file);
}


export function listMemories({
  type = null,
  projectId = null,
  limit = 50,
} = {}) {
  initBrain();

  const files = listNoteFiles(
    { max: DEFAULT_SCAN_LIMIT }
  );

  const notes = [];

  for (const file of files) {
    const note = readNote(file);

    if (!note) continue;
    if (type && note.type !== type) continue;
    if (projectId && note.projectId !== projectId) continue;

    notes.push(note);
  }

  notes.sort(
    (a, b) =>
      (b.created ?? "").localeCompare(
        a.created ?? ""
      )
  );

  return notes.slice(0, limit);
}


export function memoryStats() {
  initBrain();

  const files = listNoteFiles(
    { max: DEFAULT_SCAN_LIMIT }
  );

  const byType = {};
  let total = 0;

  for (const file of files) {
    const note = readNote(file);

    if (!note) continue;

    total += 1;

    const type = note.type ?? "note";

    byType[type] = (byType[type] ?? 0) + 1;
  }

  return { total, byType };
}


export function updateMemory(
  id,
  patch = {}
) {
  const file = findNoteFile(id);

  if (!file) return null;

  const updated = readNote(file);

  if (!updated) return null;

  if (patch.type) {
    if (!MEMORY_TYPES.includes(patch.type)) {
      throw new Error(
        `Type de mémoire invalide : ${patch.type}`
      );
    }
    updated.type = patch.type;
  }

  if (patch.content !== undefined) {
    updated.content = String(patch.content)
      .trim()
      .slice(0, MAX_CONTENT);
  }

  if (patch.projectId !== undefined) {
    updated.projectId = patch.projectId;
  }

  if (patch.title !== undefined) {
    updated.title = String(patch.title).trim();
  }

  if (patch.importance !== undefined) {
    updated.importance = patch.importance;
  }

  if (patch.confidence !== undefined) {
    updated.confidence = patch.confidence;
  }

  if (patch.tags !== undefined) {
    updated.tags = patch.tags;
  }

  for (const key of [
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
  ]) {
    if (patch[key] !== undefined) {
      updated[key] = patch[key];
    }
  }

  const result = writeNote(updated);

  if (pathChanged(file, result.file)) {
    try {
      unlinkSync(file);
    } catch {
      // L'ancien fichier n'existe peut-être plus.
    }
  }

  invalidateSemanticIndex();

  return result;
}


export function forgetMemory(id) {
  const file = findNoteFile(id);

  if (!file) return false;

  const deleted = deleteNote(file);

  if (deleted) {
    invalidateSemanticIndex();
  }

  return deleted;
}


export function countMemories() {
  initBrain();

  return listNoteFiles(
    { max: DEFAULT_SCAN_LIMIT }
  ).length;
}


export function coreMemories(limit = 3) {
  initBrain();

  return listMemories({
    limit: DEFAULT_SCAN_LIMIT,
  })
    .filter(note => note.type !== "project")
    .sort(
      (a, b) =>
        (b.importance ?? 0) - (a.importance ?? 0)
    )
    .slice(0, limit);
}


export function relinkMemories() {
  initBrain();

  const notes = listMemories({
    limit: DEFAULT_SCAN_LIMIT,
  }).filter(note => note.type !== "project");

  let updated = 0;

  for (const note of notes) {
    const computed = findRelatedNotes({
      text: note.content,
      tags: note.tags ?? [],
      projectId: note.projectId,
      excludeId: note.id,
    });

    const existing = note.relations ?? [];

    const merged = Array.from(
      new Set([...existing, ...computed])
    )
      .filter(id => id !== note.id)
      .slice(0, MAX_RELATIONS);

    if (merged.length === existing.length) {
      continue;
    }

    updateMemory(note.id, { relations: merged });

    updated += 1;
  }

  return {
    scanned: notes.length,
    linked: updated,
  };
}


function pathChanged(
  before,
  after
) {
  return before !== after;
}


function ensureProjectNote(projectId) {
  const name = String(projectId).trim();

  if (!name) return;

  if (findProjectHub(name)) return;

  writeNote({
    type: "project",
    title: name,
    content:
      `Souche du projet **${name}**.\n` +
      `Toutes les notes liées à ce projet pointent vers cette note.`,
    projectId: name,
    importance: 1,
    status: "active",
    tags: ["projet"],
  });

  refreshProjectIndex();
}


function findLatestProjectEventId(projectId) {
  const notes = recallMemories({
    type: "checkpoint",
    projectId,
    limit: 1,
  });

  return notes.length > 0
    ? notes[0].id
    : null;
}


// ============================================================
// RELATIONS ENTRE NOTES
// ============================================================

function extractKeywords(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4)
    .filter(word => !COMMON_WORDS.has(word));

  return Array.from(new Set(words)).slice(0, 12);
}


function findRelatedNotes({
  text,
  tags = [],
  projectId = null,
  excludeId = null,
}) {
  const keywords = extractKeywords(text);

  if (!keywords.length) return [];

  const files = listNoteFiles(
    { max: DEFAULT_SCAN_LIMIT }
  );

  const notes = [];

  for (const file of files) {
    const note = readNote(file);

    if (!note) continue;

    notes.push(note);
  }

  const haystackOf = note =>
    normalize(
      `${note.title ?? ""} ${note.content ?? ""} ` +
      `${(note.tags ?? []).join(" ")}`
    );

  const documentFrequency = {};

  for (const keyword of keywords) {
    let count = 0;

    for (const note of notes) {
      if (haystackOf(note).includes(keyword)) {
        count++;
      }
    }

    documentFrequency[keyword] =
      Math.max(count, 1);
  }

  const scored = [];

  for (const note of notes) {
    if (note.type === "project") continue;
    if (note.id === excludeId) continue;

    const haystack = haystackOf(note);

    let score = 0;

    for (const keyword of keywords) {
      if (haystack.includes(keyword)) {
        score += 1 / documentFrequency[keyword];
      }
    }

    for (const tag of tags) {
      if ((note.tags ?? []).includes(tag)) {
        score += 2;
      }
    }

    if (
      projectId &&
      note.projectId === projectId
    ) {
      score += 0.5;
    }

    if (score >= 1) {
      scored.push({ id: note.id, score });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.id ?? "").localeCompare(b.id ?? "")
  );

  return scored
    .slice(0, MAX_RELATIONS)
    .map(candidate => candidate.id);
}


function backlinkRelations(noteId, relationIds) {
  for (const id of relationIds.slice(0, MAX_BACKLINK)) {
    try {
      const target = getMemory(id);

      if (!target) continue;

      const current = target.relations ?? [];
      const merged = Array.from(
        new Set([...current, noteId])
      )
        .filter(relation => relation !== id)
        .slice(0, MAX_RELATIONS);

      if (merged.length === current.length) {
        continue;
      }

      updateMemory(id, { relations: merged });
    } catch {
      // Une note orpheline ne bloque pas les autres.
    }
  }
}


// ============================================================
// PROJECT COPILOT CORE
// ============================================================

export function findProjectHub(projectId) {
  const name = String(projectId ?? "").trim();

  if (!name) return null;

  return recallMemories({
    type: "project",
    projectId: name,
    limit: 1,
  })[0] ?? null;
}


export function initProject({
  name,
  goal,
  status = "active",
} = {}) {
  const projectName = String(name ?? "")
    .trim();

  if (!projectName) {
    throw new Error("Nom de projet vide.");
  }

  let hub = findProjectHub(projectName);

  if (!hub) {
    hub = writeNote({
      type: "project",
      title: projectName,
      content:
        `Projet **${projectName}**.\n` +
        `Objectif et état courant gérés ici.`,
      projectId: projectName,
      importance: 1,
      status,
      goal: goal?.trim() || "",
      tags: ["projet"],
    });
  } else if (goal) {
    hub = updateMemory(hub.id, {
      goal: String(goal).trim(),
      status,
    });
  }

  refreshProjectIndex();

  return hub;
}


export function setProjectHub(
  projectId,
  patch = {}
) {
  const hub = findProjectHub(projectId);

  if (!hub) {
    throw new Error(
      `Projet introuvable : ${projectId} (project_init ?)`
    );
  }

  const updated = updateMemory(hub.id, patch);

  refreshProjectIndex();

  return updated;
}


export function projectCheckpoint({
  projectId,
  summary,
  nextAction,
} = {}) {
  const hub = findProjectHub(projectId);

  if (!hub) {
    throw new Error(
      `Projet introuvable : ${projectId} (project_init ?)`
    );
  }

  const text = String(summary ?? "").trim();

  if (!text) {
    throw new Error("Résumé de checkpoint vide.");
  }

  const checkpoint = rememberMemory({
    type: "checkpoint",
    content: text,
    projectId,
    importance: 0.7,
    tags: ["log"],
  });

  const patch = {
    lastCheckpoint:
      String(checkpoint.created ?? "").slice(0, 10),
  };

  if (nextAction) {
    patch.nextAction =
      String(nextAction).trim().slice(0, 140);
  }

  setProjectHub(projectId, patch);

  if (nextAction) {
    refreshProjectIndex();
  }

  return checkpoint;
}


export function projectLog({
  projectId,
  kind = "activity",
  content,
} = {}) {
  const hub = findProjectHub(projectId);

  if (!hub) {
    throw new Error(
      `Projet introuvable : ${projectId} (project_init ?)`
    );
  }

  const type =
    kind === "decision"
      ? "decision"
      : "event";

  return rememberMemory({
    type,
    content: String(content ?? "").trim(),
    projectId,
    importance:
      type === "decision" ? 0.8 : 0.4,
    confidence: type === "decision" ? 1 : 0.8,
    tags: ["log"],
  });
}


export function projectResume(projectId) {
  const hub = findProjectHub(projectId);

  if (!hub) return null;

  const recentEvents = recallMemories({
    type: "event",
    projectId,
    limit: 3,
  });

  const decisions = recallMemories({
    type: "decision",
    projectId,
    limit: 3,
  });

  const checkpoints = recallMemories({
    type: "checkpoint",
    projectId,
    limit: 2,
  });

  return {
    id: hub.id,
    projectId,
    title: hub.title,
    status: hub.status ?? "active",
    goal: hub.goal ?? null,
    milestones: hub.milestones ?? null,
    nextAction: hub.nextAction ?? null,
    lastCheckpoint: hub.lastCheckpoint ?? null,
    updated: hub.updated ?? null,
    recentEvents:
      recentEvents.map(note =>
        ({ id: note.id, content: note.content })
      ),
    decisions:
      decisions.map(note =>
        ({ id: note.id, content: note.content })
      ),
    checkpoints:
      checkpoints.map(note =>
        ({ id: note.id, content: note.content })
      ),
  };
}


export function listProjects() {
  initBrain();

  return listMemories({
    type: "project",
    limit: 200,
  }).map(note => ({
    id: note.id,
    name: note.title,
    projectId: note.projectId ?? note.title,
    status: note.status ?? "active",
    goal: note.goal ?? null,
    nextAction: note.nextAction ?? null,
    lastCheckpoint: note.lastCheckpoint ?? null,
    updated: note.updated ?? null,
  }));
}


export function removeProject(projectId) {
  const hub = findProjectHub(projectId);

  if (!hub) {
    throw new Error(
      `Projet introuvable : ${projectId}`
    );
  }

  const hubFile = findNoteFile(hub.id);

  if (hubFile) {
    deleteNote(hubFile);
  }

  const childNotes = recallMemories({
    projectId,
    limit: DEFAULT_SCAN_LIMIT,
  })
    .filter(note => note.id !== hub.id)
    .filter(note => note.type !== "project");

  for (const note of childNotes) {
    try {
      updateMemory(note.id, { projectId: null });
    } catch {
      // Passe au suivant.
    }
  }

  refreshProjectIndex();

  return {
    removed: hub.title,
    orphanedNotes: childNotes.length,
  };
}


function refreshProjectIndex() {
  try {
    const dir = join(
      getNoteDir(),
      "projets"
    );

    mkdirSync(dir, { recursive: true });

    const projects = listProjects()
      .sort((a, b) =>
        (a.updated ?? "").localeCompare(b.updated ?? "")
      );

    const indexFile = join(dir, "_index.md");

    if (!projects.length) {
      if (existsSync(indexFile)) {
        try {
          unlinkSync(indexFile);
        } catch {
          // Rien à faire.
        }
      }
      return;
    }

    const lines = projects.map(
      p =>
        `- **${p.name}** — ` +
        `${p.status}${p.nextAction
          ? ` → ${p.nextAction}`
          : ""}`
    );

    const body = [
      "---",
      "id: _index",
      "title: Projets",
      "type: index",
      "updated: " + new Date().toISOString(),
      "---",
      "",
      "# Projets",
      "",
      ...lines,
      "",
    ].join("\n");

    writeFileSync(
      indexFile,
      body,
      "utf8"
    );
  } catch {
    // L'index ne doit jamais bloquer l'API.
  }
}


function findLatestEventId() {
  const events = recallMemories({
    type: "event",
    limit: 1,
  });

  return events.length > 0
    ? events[0].id
    : null;
}


// ============================================================
// MEMORY BRAIN V2 — PONT SÉMANTIQUE (async)
// ------------------------------------------------------------
// Recherche par sens, voisinage (graphe), doublons et
// consolidation. Moteurs dans semantic.js / embed.js.
// ============================================================

export async function semanticRecall({
  query,
  type = null,
  projectId = null,
  limit = 10,
  threshold = 0,
} = {}) {
  initBrain();

  return semanticSearch({
    query,
    type,
    projectId,
    limit,
    threshold,
  });
}


export async function semanticGraph(
  id,
  {
    limit = 5,
    threshold = 0.4,
  } = {}
) {
  initBrain();

  return semanticNeighbors(id, { limit, threshold });
}


export async function semanticDedupeList({
  threshold = 0.9,
  maxGroups = 20,
} = {}) {
  initBrain();

  return findDuplicateGroups({ threshold, maxGroups });
}


export async function semanticConsolidate({
  threshold = 0.9,
  dryRun = true,
} = {}) {
  initBrain();

  return consolidateDuplicates({ threshold, dryRun });
}


export async function semanticRelink({
  limit = 3,
  threshold = 0.4,
} = {}) {
  initBrain();

  return semanticRelinkMemories({ limit, threshold });
}


// ============================================================
// V2 ARCHIVAGE & AGING (notes hors du périmètre de rappel)
// ============================================================

export function archiveMemory(id) {
  const file = findNoteFile(id);

  if (!file) return null;

  const note = readNote(file);

  if (!note) return null;

  const destination = archiveNote(file);

  if (!destination) return null;

  invalidateSemanticIndex();

  return {
    id: note.id,
    title: note.title,
    type: note.type,
    archived: true,
    file: destination,
  };
}


export function unarchiveMemory(id) {
  const files = listArchivedNoteFiles({
    max: 5000,
  });

  const file = files.find(candidate => {
    const note = readNote(candidate);
    return note && note.id === id;
  });

  if (!file) return null;

  const destination = unarchiveNote(file);

  if (!destination) return null;

  invalidateSemanticIndex();

  return {
    id,
    restored: true,
    file: destination,
  };
}


export function listArchivedMemories({
  limit = 50,
} = {}) {
  initBrain();

  const notes = [];

  for (const file of listArchivedNoteFiles({
    max: 5000,
  })) {
    const note = readNote(file);

    if (!note) continue;

    notes.push(note);
  }

  notes.sort(
    (a, b) =>
      (b.updated ?? "").localeCompare(a.updated ?? "")
  );

  return notes.slice(0, limit);
}


// Vieillissement : documente les notes trop anciennes, à faible
// importance, et (si demandé) les archive hors du périmètre de rappel.
export function agingSweep({
  olderThanDays = 90,
  maxImportance = 0.4,
  dryRun = true,
} = {}) {
  initBrain();

  const cutoff =
    Date.now() -
    olderThanDays * 86_400_000;

  const candidates = [];

  for (const file of listNoteFiles({
    max: DEFAULT_SCAN_LIMIT,
  })) {
    const note = readNote(file);

    if (!note) continue;

    if (
      note.type === "project" ||
      note.type === "place"
    ) {
      continue;
    }

    if ((note.importance ?? 0.5) > maxImportance) {
      continue;
    }

    const timestamp = Date.parse(
      note.updated ?? note.created ?? ""
    );

    if (
      !Number.isFinite(timestamp) ||
      timestamp > cutoff
    ) {
      continue;
    }

    candidates.push({
      id: note.id,
      title: note.title,
      type: note.type,
      importance: note.importance,
      updated: note.updated ?? note.created,
    });
  }

  if (dryRun) {
    return {
      dryRun: true,
      candidates,
      count: candidates.length,
    };
  }

  const archived = [];

  for (const candidate of candidates) {
    archiveMemory(candidate.id);
    archived.push(candidate.id);
  }

  invalidateSemanticIndex();

  return {
    dryRun: false,
    archived,
    count: archived.length,
  };
}