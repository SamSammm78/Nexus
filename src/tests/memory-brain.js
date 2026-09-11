import {
  tmpdir,
} from "node:os";

import {
  join,
} from "node:path";

import {
  readFileSync,
} from "node:fs";

import {
  initBrain,
  rememberMemory,
  recallMemories,
  getMemory,
  listMemories,
  updateMemory,
  forgetMemory,
  initProject,
} from "../memory/brain.js";

import {
  slugifyTitle,
} from "../memory/notes.js";


process.env.NEXUS_VAULT = join(
  tmpdir(),
  `nexus-memory-test-${Date.now()}`
);


function assert(condition, label) {
  if (!condition) {
    console.error("ÉCHEC :", label);
    process.exitCode = 1;
    return;
  }
  console.log("OK   :", label);
}


console.log("=== Memory Brain V1 (notes Obsidian) ===\n");

const dir = initBrain();
console.log(`Dossier mémoire : ${dir}\n`);

const noteA = rememberMemory({
  type: "fact",
  title: "Utilise un NAS Synology",
  content: "L'utilisateur utilise un NAS Synology (DSM) à la maison.",
  projectId: "nexus",
  importance: 0.7,
  tags: ["nas", "maison"],
});

assert(noteA.id, "création note fact");

let hub = recallMemories({
  type: "project",
  projectId: "nexus",
  limit: 1,
});

assert(
  hub.length === 0,
  "aucune souche auto-créée par memory_add"
);

initProject({ name: "nexus" });

hub = recallMemories({
  type: "project",
  projectId: "nexus",
  limit: 1,
});

assert(
  hub.length === 1,
  "souche projet créée par project_init (projets/nexus.md)"
);

const eventA = rememberMemory({
  type: "event",
  title: "Reprends le projet",
  content: "Échange : « reprends le projet » → « Ok, voici l'état ».",
});

assert(eventA.parent === null, "premier event sans parent");

const eventB = rememberMemory({
  type: "event",
  title: "Installe lm studio",
  content: "Échange : « installe LM Studio » → « Fait ».",
});

assert(
  eventB.parent === eventA.id,
  "event chaîné au précédent (timeline)"
);

const found = recallMemories({
  keywords: ["synology"],
});

assert(
  found.some(note => note.id === noteA.id),
  "recherche par mot-clé (synology)"
);

const filtered = recallMemories({
  type: "event",
});

assert(
  filtered.length >= 2,
  "filtre par type (event)"
);

const fetched = getMemory(noteA.id);
assert(
  fetched?.projectId === "nexus",
  "lecture d'une note + frontmatter (project)"
);
assert(
  fetched?.title === "Utilise un NAS Synology",
  "titre stocké en frontmatter"
);
const rewired = updateMemory(noteA.id, {
  content: noteA.content,
});

assert(
  /\[\[projets\/nexus\]\]/.test(
    readFileOf(rewired)
  ),
  "wikilink régénéré vers la souche projet (existe)"
);

const updated = updateMemory(noteA.id, {
  importance: 0.8,
  content: "L'utilisateur utilise un NAS Synology (DSM) à la maison.",
});

assert(
  updated.importance === 0.8,
  "mise à jour importance"
);

const deleted = forgetMemory(eventB.id);

assert(deleted, "suppression note event");

const slugOk = slugifyTitle("Installe LM Studio et configure le port");

assert(
  slugOk === "installe-lm-studio-configure-port",
  `slug optimisé (stopwords retirés) : ${slugOk}`
);

const all = listMemories({ limit: 10 });
assert(
  all.every(note => note.file.endsWith(".md")),
  "liste des notes (fichiers .md)"
);

const noteB = rememberMemory({
  type: "fact",
  title: "NAS ethernet",
  content:
    "Le NAS Synology est relié en ethernet au réseau de la maison.",
  tags: ["nas"],
});

assert(
  (noteB.relations ?? []).includes(noteA.id),
  "nouvelle note liée à la note existante (mot-clé partagé)"
);

assert(
  (getMemory(noteA.id).relations ?? []).includes(noteB.id),
  "backlink : la note existante pointe vers la nouvelle"
);

const noteAFilename =
  getMemory(noteA.id).file
    .split("/").pop()
    .replace(/\.md$/, "");

const fileB = readFileOf(
  getMemory(noteB.id)
);

assert(
  fileB.includes(`[[${noteAFilename}]]`),
  `wikilink ↔ généré vers ${noteAFilename}`
);

console.log("\n--- Notes générées ---");
for (const note of all) {
  console.log(`• ${note.folder ? `projets/` : ""}${note.file.split("/").pop()}  ← parent: ${note.parent ?? "—"}`);
}

console.log("\n=== Tests terminés ===");


function readFileOf(note) {
  return readFileSync(note.file, "utf8");
}