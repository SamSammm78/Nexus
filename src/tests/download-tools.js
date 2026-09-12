import {
  test,
} from "node:test";

import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  sanitizeFilename,
  getUniqueFilename,
  extractRefForText,
  isNoActivePage,
} from "../tools/download.js";


const TMP = fs.mkdtempSync(
  path.join(os.tmpdir(), "nexus-download-tests-")
);


test("sanitizeFilename : rejette les noms vides", () => {
  assert.equal(sanitizeFilename(), null);
  assert.equal(sanitizeFilename(""), null);
  assert.equal(sanitizeFilename("   "), null);
  assert.equal(sanitizeFilename(42), null);
});


test("sanitizeFilename : neutralise le path traversal", () => {
  const a = sanitizeFilename("../../test.pdf");

  assert.ok(a);
  assert.ok(!a.includes("/"));
  assert.ok(!a.includes("\\"));
  assert.equal(path.basename(a), a);

  const b = sanitizeFilename("..\\..\\evil.pdf");

  assert.ok(b);
  assert.ok(!b.includes("/"));
  assert.ok(!b.includes("\\"));
  assert.equal(path.basename(b), b);

  const c = sanitizeFilename("/etc/passwd");

  assert.equal(path.basename(c), c);
  assert.ok(!c.includes("/"));
});


test("sanitizeFilename : bloque les noms réservés", () => {
  assert.equal(sanitizeFilename("."), null);
  assert.equal(sanitizeFilename(".."), null);
  assert.equal(sanitizeFilename("..."), null);
});


test("sanitizeFilename : retire les caractères de contrôle", () => {
  const name = sanitizeFilename("factu\u0000re\u001f.pdf");

  assert.equal(name, "facture.pdf");
});


test("getUniqueFilename : crée facture (1).pdf sans écraser", () => {
  const dir = path.join(TMP, "dedup");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "facture.pdf"), "a");
  fs.writeFileSync(path.join(dir, "facture (1).pdf"), "b");

  const next = getUniqueFilename(dir, "facture.pdf");

  assert.equal(next, "facture (2).pdf");
});


test("getUniqueFilename : conserve l'extension", () => {
  const dir = path.join(TMP, "dedup-ext");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "archive.tar.gz"), "a");

  const next = getUniqueFilename(dir, "archive.tar.gz");

  assert.equal(next, "archive.tar (1).gz");
});


test("extractRefForText : trouve le ref d'un élément par texte", () => {
  const snapshot = [
    "### Page",
    "- Page URL: http://127.0.0.1:8080/",
    "### Snapshot",
    "```yaml",
    "- link \"TÉLÉCHARGER la facture de septembre\" [ref=e2] [cursor=pointer]:",
    "  - /url: /file.txt",
    "```",
  ].join("\n");

  assert.equal(
    extractRefForText(snapshot, "facture de septembre"),
    "e2"
  );

  assert.equal(
    extractRefForText(snapshot, "TÉLÉCHARGER"),
    "e2"
  );

  // Accents mélangés par le dump UTF-8 → Windows-1252 du snapshot.
  const mangledSnapshot = [
    "```yaml",
    "- link \"TÃ©lÃ©charger la facture\" [ref=e2] [cursor=pointer]:",
    "```",
  ].join("\n");

  assert.equal(
    extractRefForText(mangledSnapshot, "Télécharger"),
    "e2"
  );

  const mangledUpperSnapshot = [
    "```yaml",
    "- link \"TÃ‰LÃ‰CHARGER la facture\" [ref=e2] [cursor=pointer]:",
    "```",
  ].join("\n");

  assert.equal(
    extractRefForText(mangledUpperSnapshot, "TÉLÉCHARGER la facture"),
    "e2"
  );

  assert.equal(
    extractRefForText(snapshot, "introuvable"),
    null
  );
});


test("isNoActivePage : détecte l'absence de page ouverte", () => {
  const blank = [
    "### Page",
    "- Page URL: about:blank",
    "### Snapshot",
    "```yaml",
    "",
    "```",
  ].join("\n");

  assert.equal(isNoActivePage(blank), true);

  const loaded = [
    "### Page",
    "- Page URL: http://127.0.0.1:8080/",
    "### Snapshot",
    "```yaml",
    "- link \"Télécharger\" [ref=e2]:",
    "```",
  ].join("\n");

  assert.equal(isNoActivePage(loaded), false);
});