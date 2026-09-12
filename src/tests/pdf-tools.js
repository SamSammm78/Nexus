import {
  test,
} from "node:test";

import assert from "node:assert";

import {
  parseContentDisposition,
  filenameFromUrl,
  ensurePdfExtension,
  extractJsonFromText,
  pdfCandidateCode,
} from "../tools/pdf.js";

import vm from "node:vm";


test("parseContentDisposition : filename*=UTF-8'' décodé", () => {
  const d = "attachment; filename*=UTF-8''Cours%20d%27alg%C3%A8bre.pdf";

  assert.equal(
    parseContentDisposition(d),
    "Cours d'algèbre.pdf"
  );
});


test("parseContentDisposition : filename simple (guillemets ou non)", () => {
  assert.equal(
    parseContentDisposition('attachment; filename="facture.pdf"'),
    "facture.pdf"
  );

  assert.equal(
    parseContentDisposition("attachment; filename=rapport.pdf"),
    "rapport.pdf"
  );
});


test("parseContentDisposition : absent → null", () => {
  assert.equal(
    parseContentDisposition(null),
    null
  );

  assert.equal(
    parseContentDisposition(""),
    null
  );

  assert.equal(
    parseContentDisposition("inline"),
    null
  );
});


test("filenameFromUrl : nom depuis le chemin, query ignorée", () => {
  assert.equal(
    filenameFromUrl("https://exemple.fr/documents/cours.pdf?token=abc&v=2"),
    "cours.pdf"
  );

  assert.equal(
    filenameFromUrl("https://exemple.fr/cours%20d%27alg%C3%A8bre.pdf"),
    "cours d'algèbre.pdf"
  );
});


test("filenameFromUrl : chemin sans nom → null", () => {
  assert.equal(
    filenameFromUrl("https://exemple.fr/"),
    null
  );

  assert.equal(
    filenameFromUrl("https://exemple.fr"),
    null
  );

  assert.equal(
    filenameFromUrl(null),
    null
  );
});


test("ensurePdfExtension : ajoute .pdf si absent", () => {
  assert.equal(
    ensurePdfExtension("cours"),
    "cours.pdf"
  );

  assert.equal(
    ensurePdfExtension("cours.pdf"),
    "cours.pdf"
  );

  assert.equal(
    ensurePdfExtension("cours.PDF"),
    "cours.PDF"
  );
});


test("extractJsonFromText : extrait l'objet du blob MCP", () => {
  const blob = [
    "### Result",
    '{"ok":true,"url":"http://exemple.fr/cours.pdf","length":5}',
    "### Ran Playwright code",
    "```js",
    "await (async (page) => { ... })(page);",
    "```",
    "### Page",
    "- Page URL: http://exemple.fr/cours.pdf",
  ].join("\n");

  const data = extractJsonFromText(blob);

  assert.equal(data.ok, true);
  assert.equal(data.url, "http://exemple.fr/cours.pdf");
  assert.equal(data.length, 5);
});


test("extractJsonFromText : gère une chaîne JSON.stringify'd", () => {
  const blob = [
    "### Result",
    '"{\\"ok\\":true,\\"url\\":\\"x\\"}"',
    "### Ran Playwright code",
  ].join("\n");

  assert.deepEqual(
    extractJsonFromText(blob),
    { ok: true, url: "x" }
  );
});


test("pdfCandidateCode : se compile dans un contexte vm (pas d'échappement cassé)", () => {
  const code = pdfCandidateCode();

  assert.ok(code.includes("async (page)"));
  assert.ok(code.includes("blob:"));

  // Régression : `\/` dans le template devenait `/` et cassait la regex.
  assert.ok(!code.includes("blob:([^/]+)\\"));

  assert.doesNotThrow(() => {
    new vm.Script(`(${code})`);
  });
});


test("extractJsonFromText : réponse d'erreur ou vide → null", () => {
  assert.equal(
    extractJsonFromText("### Error\nError: boom"),
    null
  );

  assert.equal(
    extractJsonFromText(""),
    null
  );

  assert.equal(
    extractJsonFromText(null),
    null
  );
});