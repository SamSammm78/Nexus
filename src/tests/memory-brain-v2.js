import {
  test,
} from "node:test";

import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import {
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  cosineSimilarity,
  embedText,
} from "../memory/embed.js";

import {
  ageScore,
  invalidateSemanticIndex,
} from "../memory/semantic.js";

import {
  initBrain,
  rememberMemory,
  getMemory,
  recallMemories,
  semanticRecall,
  semanticGraph,
  semanticDedupeList,
  semanticConsolidate,
  semanticRelink,
  archiveMemory,
  unarchiveMemory,
  listArchivedMemories,
  agingSweep,
} from "../memory/brain.js";

import {
  writeNote,
  getNoteDir,
} from "../memory/notes.js";

import {
  memory_searchTool,
} from "../tools/memory.js";


process.env.NEXUS_EMBED_MODE = "local";

const VAULT = path.join(
  os.tmpdir(),
  `nexus-memory-v2-${Date.now()}`
);

process.env.NEXUS_VAULT = VAULT;

initBrain();

test.after(() => {
  try {
    rmSync(VAULT, { recursive: true, force: true });
  } catch {}
});


// ======================================================
// EMBEDDINGS (unitaire)
// ======================================================

test("embed : vecteurs identiques → cosinus = 1", async () => {
  const a = await embedText("L'utilisateur joue aux échecs en ligne le soir");
  const b = await embedText("L'utilisateur joue aux échecs en ligne le soir");

  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-6);
});


test("embed : textes proches > textes très différents", async () => {
  const échecs = await embedText("je joue aux échecs en ligne avec des amis");
  const échecsBis = await embedText("les échecs sont mon jeu en ligne préféré");
  const cuisine = await embedText("je cuisine des pâtes à la sauce tomate le dimanche");

  const simProche = cosineSimilarity(échecs, échecsBis);
  const simLoin = cosineSimilarity(échecs, cuisine);

  assert.ok(simProche > simLoin, `simProche=${simProche} > simLoin=${simLoin}`);
  assert.ok(simProche > 0.2);
});


test("embeddings : stratégie locale sélectionnée", async () => {
  assert.equal(process.env.NEXUS_EMBED_MODE, "local");

  const v = await embedText("test");

  assert.ok(v instanceof Float32Array);
  assert.equal(v.length, 512);
});


test("ageScore : note récente ≫ note ancienne", () => {
  const recent = ageScore({
    updated: new Date().toISOString(),
  });
  const ancient = ageScore({
    updated: "2020-01-01T12:00:00Z",
  });

  assert.ok(recent > 0.9);
  assert.ok(ancient < 0.1);
  assert.ok(recent > ancient);
});


// ======================================================
// RECHERCHE SÉMANTIQUE
// ======================================================

const noteChess = await rememberMemory({
  type: "preference",
  title: "Échecs en ligne",
  content: "L'utilisateur joue aux échecs en ligne tous les soirs, site chess.com.",
  importance: 0.7,
  tags: ["jeu"],
});

const noteCoffee = await rememberMemory({
  type: "preference",
  title: "Café au réveil",
  content: "Le matin, l'utilisateur boit un grand café serré avant de travailler.",
  importance: 0.6,
  tags: ["maison"],
});

const noteProjet = await rememberMemory({
  type: "fact",
  title: "Projet Nexus",
  content: "Le projet Nexus est un assistant personnel codé en JavaScript.",
  importance: 0.9,
});

test("semanticRecall : recherche par le sens (échecs)", async () => {
  const results = await semanticRecall({
    query: "jeu de plateau en ligne le soir",
    limit: 5,
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].id, noteChess.id);
  assert.ok(results[0].similarity > 0);
});


test("semanticRecall : filtre par type et par projet", async () => {
  const preferences = await semanticRecall({
    query: "échecs en ligne",
    type: "preference",
    limit: 5,
  });

  assert.ok(preferences.every(note => note.type === "preference"));

  const facts = await semanticRecall({
    query: "échecs en ligne",
    type: "fact",
    limit: 5,
  });

  assert.ok(!facts.some(note => note.id === noteChess.id));
});


test("semanticRecall : threshold exclut les faibles similarités", async () => {
  const results = await semanticRecall({
    query: "café serré le matin",
    limit: 10,
    threshold: 0.05,
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].id, noteCoffee.id);
});


test("semanticRecall : l'index se rafraîchit après un ajout", async () => {
  const noteSport = await rememberMemory({
    type: "preference",
    title: "Course à pied",
    content: "L'utilisateur fait du footing le dimanche matin dans le parc.",
    importance: 0.5,
  });

  const results = await semanticRecall({
    query: "course en plein air le dimanche",
    limit: 5,
  });

  assert.ok(results.length >= 1);
  assert.equal(noteSport.id, results[0].id);
});


test("recallMemories (V1) reste opérationnel", () => {
  const found = recallMemories({
    keywords: ["échecs"],
    limit: 5,
  });

  assert.ok(found.some(note => note.id === noteChess.id));
});


test("memory_search : la requête sémantique passe par le tool", async () => {
  const result = await memory_searchTool.execute({
    query: "que préfère l'utilisateur le soir ?",
    limit: 5,
  });

  assert.equal(result.semantic, true);
  assert.ok(result.notes.length >= 1);
  assert.ok(result.notes.some(note => note.id === noteChess.id));
});


// ======================================================
// GRAPHE (voisinage sémantique)
// ======================================================

test("semanticGraph : voisins proches, sans la note elle-même", async () => {
  const neighbors = await semanticGraph(noteChess.id, {
    limit: 5,
    threshold: 0,
  });

  assert.ok(neighbors.length >= 1);

  const ids = neighbors.map(note => note.id);

  assert.ok(!ids.includes(noteChess.id));
  assert.ok(typeof noteProjet.id === "string");
});


test("semanticGraph : note inconnue → liste vide", async () => {
  const neighbors = await semanticGraph("id-inexistant", {
    limit: 5,
  });

  assert.deepEqual(neighbors, []);
});


test("semanticRelink : enrichit les relations sans erreur", async () => {
  const result = await semanticRelink({
    limit: 2,
    threshold: 0.05,
  });

  assert.ok(result.scanned >= 3);
  assert.ok(typeof result.linked === "number");
});


// ======================================================
// DOUBLONS + CONSOLIDATION
// ======================================================

let duplicateGroup = null;

test("semanticDedupeList : détecte les notes quasi identiques", async () => {
  const a = await rememberMemory({
    type: "note",
    title: "Recette tomates",
    content: "Préparation : couper les tomates, ajouter huile d'olive, basilic et sel. Temps de cuisson 40 minutes.",
    importance: 0.8,
  });

  const b = await rememberMemory({
    type: "note",
    title: "Recette tomates cerises",
    content: "Préparation : couper les tomates cerises, ajouter huile d'olive, basilic et du sel. Temps de cuisson 40 minutes environ.",
  });

  await rememberMemory({
    type: "note",
    title: "Notes de lecture",
    content: "Résumé du livre que je lis en ce moment sur la physique quantique.",
  });

  const groups = await semanticDedupeList({
    threshold: 0.9,
  });

  const group = groups.find(g =>
    g.duplicates.some(d => d.id === b.id)
  );

  assert.ok(group, "le doublon B appartient à un groupe");
  assert.equal(group.keeper.id, a.id, "A (plus important) est le keeper");

  const memberIds = new Set(
    [group.keeper.id, ...group.duplicates.map(d => d.id)]
  );

  assert.ok(memberIds.has(a.id));
  assert.ok(memberIds.has(b.id));
  assert.equal(group.duplicates.length, 1);

  duplicateGroup = group;
});


test("semanticConsolidate (dryRun) : ne modifie rien", async () => {
  const summary = await semanticConsolidate({
    threshold: 0.9,
    dryRun: true,
  });

  assert.equal(summary.removed, 0);
  assert.ok(summary.groups >= 1);
  assert.equal(summary.merged, summary.groups);

  assert.ok(duplicateGroup, "groupe de doublons repéré plus haut");
});


test("semanticConsolidate : fusionne et supprime les doublons", async () => {
  assert.ok(duplicateGroup, "groupe de doublons préparé");

  const keeperId = duplicateGroup.keeper.id;
  const duplicateIds =
    duplicateGroup.duplicates.map(d => d.id);

  const summary = await semanticConsolidate({
    threshold: 0.9,
    dryRun: false,
  });

  assert.ok(summary.groups >= 1);
  assert.ok(summary.removed >= 1);

  const keeper = getMemory(keeperId);

  assert.ok(keeper, "keeper conservé");
  assert.ok(keeper.content.includes("Fusionné depuis"));

  for (const duplicateId of duplicateIds) {
    assert.equal(
      getMemory(duplicateId),
      null,
      `doublon ${duplicateId} supprimé`
    );
  }
});


// ======================================================
// ARCHIVAGE
// ======================================================

test("archiveMemory / unarchiveMemory : cycle complet", async () => {
  const note = await rememberMemory({
    type: "note",
    title: "Note à archiver",
    content: "Contenu à déplacer hors du rappel.",
    importance: 0.3,
  });

  const archived = archiveMemory(note.id);

  assert.ok(archived.archived);
  assert.equal(getMemory(note.id), null, "plus visible par le rappel");

  const archivedNotes = listArchivedMemories({ limit: 50 });

  assert.ok(
    archivedNotes.some(n => n.id === note.id),
    "présente dans les archives"
  );

  const restored = unarchiveMemory(note.id);

  assert.ok(restored.restored);
  assert.ok(getMemory(note.id), "de retour dans la mémoire active");
});


test("agingSweep : sélectionne les notes âgées à faible importance", async () => {
  // La note récente d'abord : rememberMemory réécrit ses backlinks —
  // vieillir les notes ensuite garantit que leur `updated` reste stable.
  const recentLow = await rememberMemory({
    type: "note",
    title: "Info fraîche",
    content: "Information récente mais mineure.",
    importance: 0.2,
  });

  const oldLow = backdate(
    writeNote({
      type: "fact",
      title: "Détail ancien",
      content: "Ancienne information mineure.",
      importance: 0.2,
    }),
    "2020-05-01T00:00:00Z"
  );

  backdate(
    writeNote({
      type: "fact",
      title: "Fait fondateur",
      content: "Fait important que je garde.",
      importance: 0.8,
    }),
    "2020-05-01T00:00:00Z"
  );

  backdate(
    writeNote({
      type: "place",
      title: "Ancien lieu",
      content: "Lieu personnel ancien.",
      importance: 0.3,
      latitude: 1,
      longitude: 2,
    }),
    "2020-05-01T00:00:00Z"
  );

  const dry = agingSweep({
    olderThanDays: 90,
    maxImportance: 0.4,
    dryRun: true,
  });

  const ids = dry.candidates.map(candidate => candidate.id);

  assert.ok(dry.dryRun);
  assert.ok(ids.includes(oldLow.id), "détail ancien peu important listé");
  assert.ok(!ids.includes(recentLow.id), "note récente exclue");

  const titles = dry.candidates.map(candidate => candidate.title);

  assert.ok(!titles.includes("Fait fondateur"), "importance élevée exclue");
  assert.ok(!titles.includes("Ancien lieu"), "lieu personnel exclu");
});;


test("agingSweep : applique l'archivage (dryRun=false)", async () => {
  const note = backdate(
    writeNote({
      type: "note",
      title: "Vieux brouillon",
      content: "Ancien brouillon jamais relu.",
      importance: 0.2,
    }),
    "2021-01-10T00:00:00Z"
  );

  const result = agingSweep({
    olderThanDays: 90,
    maxImportance: 0.4,
    dryRun: false,
  });

  assert.equal(result.dryRun, false);
  assert.ok(result.archived.includes(note.id));
  assert.equal(getMemory(note.id), null, "archivée hors du rappel");
});


// Forge une note "ancienne" : writeNote force updated=now,
// on anticipe donc la date dans le frontmatter.
function backdate(note, timestamp) {
  const raw = readFileSync(note.file, "utf8");

  const patched = raw.replace(
    /^updated: .*$/m,
    `updated: ${timestamp}`
  );

  writeFileSync(note.file, patched);

  return {
    ...getMemory(note.id),
    id: note.id,
  };
}


// ======================================================
// INDEX PERSISTANT
// ======================================================

test("index persistant : sauvegarde et réutilisation", async () => {
  process.env.NEXUS_EMBED_INDEX = "1";

  const indexPath = path.join(
    getNoteDir(),
    ".memory-index.json"
  );

  try {
    const first = await semanticRecall({
      query: "café du matin",
      limit: 5,
    });

    assert.ok(existsSync(indexPath), "fichier d'index créé");

    const payload = JSON.parse(
      readFileSync(indexPath, "utf8")
    );

    assert.ok(payload.entries.length >= 1);

    invalidateSemanticIndex();

    const second = await semanticRecall({
      query: "café du matin",
      limit: 5,
    });

    assert.equal(second.length, first.length);
    assert.ok(second[0].id === first[0].id);
  } finally {
    process.env.NEXUS_EMBED_INDEX = "";

    try {
      rmSync(indexPath, { force: true });
    } catch {}
  }
});


// ======================================================
// FUSION DÉTERMINISTE : blocs quasi-réduits ignorés
// ======================================================

test("consolidation : ne réécrit pas un contenu déjà couvert", async () => {
  const content = "Recette de salade : tomates, concombres, feta, olives, huile d'olive, citron. Mélanger le tout et servir frais.";

  const a = await rememberMemory({
    type: "note",
    title: "Salade grecque",
    content,
    importance: 0.8,
  });

  await rememberMemory({
    type: "note",
    title: "Salade grecque variante",
    content,
  });

  const dry = await semanticConsolidate({
    threshold: 0.9,
    dryRun: true,
  });

  assert.ok(dry.groups >= 1);

  const summary = await semanticConsolidate({
    threshold: 0.9,
    dryRun: false,
  });

  assert.ok(summary.redundant >= 1, `redundant=${summary.redundant}`);

  const keeper = getMemory(a.id);

  assert.ok(keeper, "keeper conservé");
  assert.equal(
    (keeper.content.match(/Fusionné depuis/g) ?? []).length,
    0,
    "aucun bloc en double réécrit"
  );
});