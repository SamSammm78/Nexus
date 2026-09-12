// ============================================================
// COUCHE SÉMANTIQUE (Memory Brain V2)
// ------------------------------------------------------------
// Recherche par sens (embeddings), similarité entre notes,
// détection de doublons, consolidation et voisinage (graphe).
// Dépend uniquement de notes.js → aucun cycle avec brain.js.
// ============================================================

import {
  listNoteFiles,
  readNote,
  writeNote,
  deleteNote,
} from "./notes.js";

import {
  embedText,
  cosineSimilarity,
  tokenize,
} from "./embed.js";


const DEFAULT_LIMIT = 300;
const DEFAULT_DUPLICATE_THRESHOLD = 0.9;
const DEFAULT_NEIGHBOR_THRESHOLD = 0.4;

let indexCache = null;
let indexBuilding = null;


export function invalidateSemanticIndex() {
  indexCache = null;
  indexBuilding = null;
}


function haystackOf(note) {
  return [
    note.title ?? "",
    note.content ?? "",
    (note.tags ?? []).join(" "),
    note.label ?? "",
    note.address ?? "",
  ].join(" ");
}


async function buildIndex() {
  const files = listNoteFiles({
    max: DEFAULT_LIMIT,
  });

  const entries = [];

  for (const file of files) {
    const note = readNote(file);

    if (!note) continue;

    entries.push({
      note,
      vector: await embedText(haystackOf(note)),
    });
  }

  return entries;
}


async function getIndex() {
  if (indexCache) return indexCache;

  if (!indexBuilding) {
    indexBuilding = buildIndex();
  }

  indexCache = await indexBuilding;
  indexBuilding = null;

  return indexCache;
}


function matchesFilters(note, {
  type = null,
  projectId = null,
} = {}) {
  if (type && note.type !== type) return false;
  if (projectId && note.projectId !== projectId) return false;

  return true;
}


function lexicalOverlap(query, haystack) {
  const queryTokens = new Set(tokenize(query));
  const haystackTokens = new Set(tokenize(haystack));

  if (!queryTokens.size) return 0;

  let matches = 0;

  for (const token of queryTokens) {
    if (haystackTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / queryTokens.size;
}


// Fraîcheur d'une note : 1 (récente) → ~0 (très ancienne).
export function ageScore(note, {
  now = Date.now(),
} = {}) {
  const date = note?.updated ?? note?.created;

  const timestamp =
    typeof date === "string"
      ? Date.parse(date)
      : NaN;

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return 0.5;
  }

  const days = Math.max(
    0,
    (now - timestamp) / 86_400_000
  );

  return Math.exp(-days / 180);
}


// ============================================================
// RECHERCHE SÉMANTIQUE
// ============================================================

export async function semanticSearch({
  query,
  type = null,
  projectId = null,
  limit = 10,
  threshold = 0,
} = {}) {
  const text = String(query ?? "").trim();

  if (!text) return [];

  const queryVector = await embedText(text);

  const index = await getIndex();

  const results = [];

  for (const { note, vector } of index) {
    if (!matchesFilters(note, { type, projectId })) {
      continue;
    }

    const similarity = cosineSimilarity(queryVector, vector);

    if (similarity < threshold) continue;

    const lexical = lexicalOverlap(text, haystackOf(note));

    const score =
      similarity +
      lexical * 0.6 +
      (note.importance ?? 0.5) * 0.15 +
      ageScore(note) * 0.08;

    results.push({
      note,
      similarity,
      lexical,
      score,
    });
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      (b.note.created ?? "").localeCompare(
        a.note.created ?? ""
      )
  );

  return results
    .slice(0, limit)
    .map(entry => ({
      ...entry.note,
      similarity: round3(entry.similarity),
    }));
}


// ============================================================
// VOISINAGE SÉMANTIQUE (graphe)
// ============================================================

export async function semanticNeighbors(
  id,
  {
    limit = 5,
    threshold = DEFAULT_NEIGHBOR_THRESHOLD,
  } = {}
) {
  const index = await getIndex();

  const self = index.find(entry => entry.note.id === id);

  if (!self) return [];

  const scored = [];

  for (const { note, vector } of index) {
    if (note.id === id) continue;

    const similarity = cosineSimilarity(
      self.vector,
      vector
    );

    if (similarity < threshold) continue;

    scored.push({ note, similarity });
  }

  scored.sort(
    (a, b) =>
      b.similarity - a.similarity ||
      (b.note.created ?? "").localeCompare(
        a.note.created ?? ""
      )
  );

  return scored
    .slice(0, limit)
    .map(entry => ({
      ...entry.note,
      similarity: round3(entry.similarity),
    }));
}


// Enrichit les relations de chaque note avec ses voisins
// sémantiques (graphe de mémoire, sans casser l'existant).
export async function semanticRelinkMemories({
  limit = 3,
  threshold = DEFAULT_NEIGHBOR_THRESHOLD,
} = {}) {
  const index = await getIndex();

  let linked = 0;

  for (const { note } of index) {
    const neighbors = await semanticNeighbors(note.id, {
      limit,
      threshold,
    });

    if (!neighbors.length) continue;

    const existing = note.relations ?? [];

    const merged = Array.from(
      new Set([
        ...existing,
        ...neighbors.map(neighbor => neighbor.id),
      ])
    )
      .filter(id => id !== note.id)
      .slice(0, 8);

    if (merged.length === existing.length) continue;

    writeNote({
      ...note,
      relations: merged,
    });

    linked += 1;
  }

  invalidateSemanticIndex();

  return {
    scanned: index.length,
    linked,
  };
}


// ============================================================
// DOUBLONS
// ============================================================

function duplicateCandidateScore(note, {
  now = Date.now(),
} = {}) {
  return (
    (note.importance ?? 0.5) * 0.6 +
    ageScore(note, { now }) * 0.25 +
    Math.min(
      (note.content ?? "").length,
      2000
    ) * 0.0005
  );
}


export async function findDuplicateGroups({
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
  maxGroups = 20,
} = {}) {
  const index = await getIndex();

  const visited = new Set();
  const groups = [];

  for (const entry of index) {
    if (visited.has(entry.note.id)) continue;

    const members = [];

    for (const other of index) {
      if (other.note.id === entry.note.id) continue;
      if (visited.has(other.note.id)) continue;

      const similarity = cosineSimilarity(
        entry.vector,
        other.vector
      );

      if (similarity >= threshold) {
        members.push({
          note: other.note,
          similarity,
        });
      }
    }

    if (members.length) {
      visited.add(entry.note.id);

      const all = [
        { note: entry.note, similarity: 1 },
        ...members,
      ];

      all.sort(
        (a, b) =>
          duplicateCandidateScore(b.note) -
          duplicateCandidateScore(a.note)
      );

      const normalized = all.map(candidate => ({
        ...candidate.note,
        similarity: round3(candidate.similarity),
      }));

      normalized.forEach(candidate =>
        visited.add(candidate.id)
      );

      groups.push({
        keeper: normalized[0],
        duplicates: normalized.slice(1),
      });

      if (groups.length >= maxGroups) break;
    }
  }

  return groups;
}


// Fusionne les doublons dans le "keeper" (le plus riche).
export async function consolidateDuplicates({
  threshold = DEFAULT_DUPLICATE_THRESHOLD,
  dryRun = true,
} = {}) {
  const groups = await findDuplicateGroups({ threshold });

  const summary = {
    groups: groups.length,
    merged: 0,
    removed: 0,
  };

  for (const group of groups) {
    if (group.duplicates.length === 0) continue;

    const keeper = group.keeper;
    const duplicates = group.duplicates;

    const mergedContent = [
      keeper.content,
      ...duplicates.map(duplicate =>
        [
          "",
          "---",
          "",
          `> Fusionné depuis « ${duplicate.title ?? "note"} » :`,
          "",
          duplicate.content,
        ].join("\n")
      ),
    ].join("\n");

    const mergedRelations = Array.from(
      new Set([
        ...(keeper.relations ?? []),
        ...duplicates.flatMap(
          duplicate => duplicate.relations ?? []
        ),
      ])
    ).filter(id => id !== keeper.id);

    const mergedTags = Array.from(
      new Set([
        ...(keeper.tags ?? []),
        ...duplicates.flatMap(
          duplicate => duplicate.tags ?? []
        ),
      ])
    ).slice(0, 8);

    if (dryRun) {
      summary.merged += duplicates.length;

      continue;
    }

    writeNote({
      ...keeper,
      content: mergedContent.slice(0, 6000),
      relations: mergedRelations,
      tags: mergedTags,
    });

    for (const duplicate of duplicates) {
      try {
        deleteNote(duplicate.file);
        summary.removed += 1;
      } catch {
        // Le fichier a peut-être déjà disparu.
      }
    }

    summary.merged += duplicates.length;
  }

  if (!dryRun && summary.removed > 0) {
    invalidateSemanticIndex();
  }

  return summary;
}


function round3(value) {
  return Math.round(value * 1000) / 1000;
}