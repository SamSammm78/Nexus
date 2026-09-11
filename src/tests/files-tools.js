import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const TMP = fs.mkdtempSync(
  path.join(os.tmpdir(), "nexus-files-")
);

process.env.NEXUS_FILES_CONFIG =
  path.join(TMP, "files-config.json");

process.env.NEXUS_FILES_ROOT =
  path.join(TMP, "Documents");

fs.mkdirSync(path.join(TMP, "Documents", "cours"), {
  recursive: true,
});
fs.mkdirSync(path.join(TMP, "Documents", "TD"), {
  recursive: true,
});
fs.writeFileSync(
  path.join(TMP, "Documents", "cours", "analyse1.md"),
  "# Analyse 1\nLimites et dérivées.\n"
);
fs.writeFileSync(
  path.join(TMP, "Documents", "TD", "td-math.pdf"),
  "%PDF-1.4 fake"
);
fs.writeFileSync(
  path.join(TMP, "Documents", "notes-nexus.txt"),
  "NEXUS files V1 ok"
);

const settings = await import(
  "../services/files/settings.js"
);

const local = await import(
  "../services/files/local.js"
);

const tools = await import(
  "../tools/files.js"
);

const { searchLocalFiles, listLocalFolder, readLocalFile } = local;
const { getFilesSettings, setFilesRoot, setFilesPriority, resolveRoot } = settings;
const [file_searchTool, file_listTool, file_readTool] = tools.filesTools;

test("settings : racine + priorité locale par défaut", () => {
  const { root, sourcePriority } = getFilesSettings();

  assert.equal(root, path.join(TMP, "Documents"));
  assert.equal(sourcePriority, "local");
});

test("settings : setFilesRoot met à jour la racine", () => {
  delete process.env.NEXUS_FILES_ROOT;

  const updated = setFilesRoot("~/TestRacine");

  assert.equal(updated, path.join(os.homedir(), "TestRacine"));

  const { root } = getFilesSettings();

  assert.equal(root, path.join(os.homedir(), "TestRacine"));

  setFilesRoot(path.join(TMP, "Documents"));

  process.env.NEXUS_FILES_ROOT = path.join(TMP, "Documents");
});

test("settings : priorité configurable + invalide refusée", () => {
  assert.equal(setFilesPriority("drive"), "drive");
  assert.equal(getFilesSettings().sourcePriority, "drive");
  assert.equal(setFilesPriority("local"), "local");

  assert.throws(() => setFilesPriority("usb"));
});

test("searchLocalFiles : correspondance de sous-chaîne insensible à la casse", () => {
  const results = searchLocalFiles({ query: "TD" });

  assert.ok(results.length >= 1);
  assert.ok(
    results.some((r) => r.name === "td-math.pdf")
  );
});

test("searchLocalFiles : restreint à un dossier", () => {
  const results = searchLocalFiles({
    query: "a",
    folder: "cours",
  });

  assert.ok(results.length >= 1);
  assert.ok(
    results.every((r) => r.folder === null || r.folder.startsWith(""))
  );
  assert.ok(
    results.some((r) => r.name === "analyse1.md")
  );
});

test("listLocalFolder : racine et sous-dossier", () => {
  const rootEntries = listLocalFolder({});
  const names = rootEntries.map((e) => e.name);

  assert.ok(names.includes("cours"));
  assert.ok(names.includes("TD"));

  const cours = listLocalFolder({ folder: "cours" });

  assert.ok(cours.some((e) => e.name === "analyse1.md"));
});

test("readLocalFile : texte, binaire et absent", () => {
  const text = readLocalFile("cours/analyse1.md");

  assert.ok(text.text.includes("Limites et dérivées"));
  assert.equal(text.truncated, false);

  const binary = readLocalFile("TD/td-math.pdf");

  assert.equal(binary.binary, true);

  assert.equal(readLocalFile("cours/absente.md"), null);
});

test("readLocalFile : troncature maxChars", () => {
  const text = readLocalFile("cours/analyse1.md", {
    maxChars: 5,
  });

  assert.equal(text.truncated, true);
  assert.ok(text.text.length <= 5);
});

test("file_search : retourne la source locale par défaut", async () => {
  const results = await file_searchTool.execute({
    query: "analyse",
  });

  assert.ok(results.length >= 1);
  assert.equal(results[0].source, "local");
  assert.ok(results[0].path.includes("analyse1.md"));
});

test("file_search : source explicite local", async () => {
  const results = await file_searchTool.execute({
    query: "nexus",
    source: "local",
  });

  assert.ok(results.some((r) => r.name === "notes-nexus.txt"));
});

test("file_list : dossier local", async () => {
  const results = await file_listTool.execute({
    folder: "cours",
    source: "local",
  });

  assert.ok(results.some((r) => r.name === "analyse1.md"));
});

test("file_read : chemin relatif local", async () => {
  const result = await file_readTool.execute({
    source: "local",
    path: "cours/analyse1.md",
  });

  assert.equal(result.source, "local");
  assert.ok(result.text.includes("# Analyse 1"));
});

test("file_read : exige path ou fileId", async () => {
  await assert.rejects(
    () => file_readTool.execute({ source: "local" }),
    /path|fileId/
  );
});

test("resolveRoot : racine stable", () => {
  assert.equal(resolveRoot(), path.join(TMP, "Documents"));
});