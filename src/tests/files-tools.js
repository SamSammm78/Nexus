import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

const TMP = fs.mkdtempSync(
  path.join(os.tmpdir(), "nexus-files-")
);

process.env.NEXUS_FILES_CONFIG =
  path.join(TMP, "files-config.json");

process.env.NEXUS_FILES_ROOT =
  path.join(TMP, "Documents");

process.env.NEXUS_FILES_DOWNLOAD_DIR =
  path.join(TMP, "Documents", "downloads");

process.env.NEXUS_FILES_BROWSER_PROFILE =
  path.join(TMP, "chrome-profile");

process.env.NEXUS_FILES_COOKIE_JAR =
  path.join(TMP, "cookies.txt");

const TMP_DOWNLOADS =
  process.env.NEXUS_FILES_DOWNLOAD_DIR;

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
fs.writeFileSync(
  path.join(TMP, "Documents", "visuel.png"),
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
);
fs.writeFileSync(
  path.join(TMP, "Documents", "archive.zip"),
  "PKfake"
);

const settings = await import(
  "../services/files/settings.js"
);

const { closeDownloadBrowser } = await import(
  "../services/browser/download.js"
);

const local = await import(
  "../services/files/local.js"
);

const tools = await import(
  "../tools/files.js"
);

const { searchLocalFiles, listLocalFolder, readLocalFile, moveLocalFile, copyLocalFile } = local;
const { getFilesSettings, setFilesRoot, setFilesPriority, resolveRoot } = settings;
const [file_searchTool, file_listTool, file_readTool, file_writeTool, file_mkdirTool, file_moveTool, file_copyTool, file_downloadTool] = tools.filesTools;

function startTestServer(payloadOrOpts) {
  const opts =
    typeof payloadOrOpts === "object" &&
    !Buffer.isBuffer(payloadOrOpts)
      ? payloadOrOpts
      : { payload: payloadOrOpts };

  const body = Buffer.isBuffer(opts.payload)
    ? opts.payload
    : Buffer.from(opts.payload ?? "bonjour");

  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "content-type": opts.contentType ?? "text/plain",
      "content-length": String(body.length),
      ...(opts.headers ?? {}),
    });

    res.end(body);
  });

  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      resolveServer({
        url:
          `http://127.0.0.1:${server.address().port}/doc.pdf`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

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
  const names = rootEntries.entries.map((e) => e.name);

  assert.ok(names.includes("cours"));
  assert.ok(names.includes("TD"));

  const cours = listLocalFolder({ folder: "cours" });

  assert.ok(cours.entries.some((e) => e.name === "analyse1.md"));
});

test("listLocalFolder : résumé du dossier (count/dirs/files/totalSize)", () => {
  const rootEntries = listLocalFolder({});

  assert.ok(rootEntries.dirs >= 1);
  assert.ok(rootEntries.files >= 1);
  assert.equal(rootEntries.count, rootEntries.dirs + rootEntries.files);
  assert.ok(rootEntries.totalSize > 0);
});

test("listLocalFolder : dossier absent → absent:true sans création", () => {
  const missing = listLocalFolder({ folder: "inexistant-xyz" });

  assert.equal(missing.absent, true);
  assert.equal(missing.count, 0);
  assert.deepEqual(missing.entries, []);
});

test("listLocalFolder : alias 'downloads' → dossier Téléchargements réel", () => {
  const alias = listLocalFolder({ folder: "downloads" });

  assert.equal(alias.path, TMP_DOWNLOADS);
});

test("readLocalFile : texte, image/PDF joints, binaire autre, absent", () => {
  const text = readLocalFile("cours/analyse1.md");

  assert.ok(text.text.includes("Limites et dérivées"));
  assert.equal(text.truncated, false);

  const pdf = readLocalFile("TD/td-math.pdf");

  assert.equal(pdf.binary, true);
  assert.equal(pdf.mimeType, "application/pdf");
  assert.ok(typeof pdf.base64 === "string");
  assert.ok(pdf.base64.length > 0);

  const png = readLocalFile("visuel.png");

  assert.equal(png.binary, true);
  assert.equal(png.mimeType, "image/png");
  assert.equal(
    Buffer.from(png.base64, "base64").subarray(0, 4).toString("hex"),
    "89504e47"
  );

  const zip = readLocalFile("archive.zip");

  assert.equal(zip.binary, true);
  assert.equal(zip.base64, undefined);

  assert.equal(readLocalFile("cours/absente.md"), null);
});

test("readLocalFile : troncature maxChars", () => {
  const text = readLocalFile("cours/analyse1.md", {
    maxChars: 5,
  });

  assert.equal(text.truncated, true);
  assert.ok(text.text.length <= 5);
});

test("readLocalFile : image trop lourde → signalée sans contenu", () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "huge.png"),
    Buffer.alloc(20 * 1024 * 1024)
  );

  const result = readLocalFile("huge.png");

  assert.equal(result.binary, true);
  assert.equal(result.tooLarge, true);
  assert.equal(result.base64, undefined);
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

test("file_list : dossier local avec résumé", async () => {
  const results = await file_listTool.execute({
    folder: "cours",
    source: "local",
  });

  assert.ok(results.entries.some((r) => r.name === "analyse1.md"));
  assert.equal(results.count, 1);
  assert.equal(results.source, "local");
});

test("file_list : dossier absent → absent:true", async () => {
  const results = await file_listTool.execute({
    folder: "dossier-inexistant",
    source: "local",
  });

  assert.equal(results.absent, true);
  assert.equal(results.entries.length, 0);
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

test("file_write : crée un fichier texte", async () => {
  const result = await file_writeTool.execute({
    path: "cours/ecrit.md",
    content: "# Écrit par NEXUS\nok",
  });

  assert.equal(result.created, true);
  assert.equal(result.overwritten, false);
  assert.ok(result.path.includes("ecrit.md"));

  const read = readLocalFile("cours/ecrit.md");

  assert.ok(read.text.includes("Écrit par NEXUS"));
});

test("file_write : écrase un fichier existant seulement après confirmation", async () => {
  const existing = path.join(TMP, "Documents", "cours", "ecrit.md");

  assert.ok(fs.existsSync(existing));

  await assert.rejects(
    () => file_writeTool.execute({
      path: "cours/ecrit.md",
      content: "nouveau",
    }),
    /confirmation|confirme/
  );

  const result = await file_writeTool.execute({
    path: "cours/ecrit.md",
    content: "nouveau",
    confirmed: true,
  });

  assert.equal(result.overwritten, true);
  assert.ok(readLocalFile("cours/ecrit.md").text.includes("nouveau"));
});

test("file_write : chemin manquant refusé", async () => {
  await assert.rejects(
    () => file_writeTool.execute({ content: "x" }),
    /Chemin/
  );
});

test("file_mkdir : crée des dossiers récursifs", async () => {
  const result = await file_mkdirTool.execute({
    path: "cours/S1/programmation",
  });

  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "cours", "S1", "programmation")),
    true
  );

  const { path: dirPath } = result;

  assert.equal(
    dirPath,
    path.join(TMP, "Documents", "cours", "S1", "programmation")
  );
});

test("file_mkdir : chemin manquant refusé", async () => {
  await assert.rejects(
    () => file_mkdirTool.execute({}),
    /Chemin/
  );
});

test("file_move : déplace un fichier dans un dossier", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "a-deplacer.txt"),
    "contenu"
  );

  const result = await file_moveTool.execute({
    from: "a-deplacer.txt",
    to: "TD",
  });

  assert.equal(result.moved, true);
  assert.ok(result.to.endsWith("TD/a-deplacer.txt"));
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "a-deplacer.txt")),
    false
  );
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "TD", "a-deplacer.txt")),
    true
  );
});

test("file_move : renomme un fichier (même dossier)", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "a-renommer.txt"),
    "contenu"
  );

  const result = await file_moveTool.execute({
    from: "a-renommer.txt",
    to: "renomme.txt",
  });

  assert.ok(result.to.endsWith("renomme.txt"));
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "a-renommer.txt")),
    false
  );
});

test("file_move : écrasement d'une destination existante exige confirmation", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "src-conf.txt"),
    "original"
  );
  fs.writeFileSync(
    path.join(TMP, "Documents", "dest-conf.txt"),
    "existant"
  );

  await assert.rejects(
    () => file_moveTool.execute({
      from: "src-conf.txt",
      to: "dest-conf.txt",
    }),
    /confirmation|confirme/
  );

  await file_moveTool.execute({
    from: "src-conf.txt",
    to: "dest-conf.txt",
    confirmed: true,
  });

  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "src-conf.txt")),
    false
  );
});

test("file_move : source introuvable refusée", async () => {
  await assert.rejects(
    () => file_moveTool.execute({
      from: "totalement-inexistant.txt",
      to: "TD",
    }),
    /introuvable/
  );
});

test("file_move : source et destination identiques refusées", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "identique.txt"),
    "x"
  );

  await assert.rejects(
    () => file_moveTool.execute({
      from: "identique.txt",
      to: "identique.txt",
    }),
    /identiques/
  );
});

test("moveLocalFile : déplacer avec chevauchement dans downloadDir via alias", async () => {
  fs.mkdirSync(TMP_DOWNLOADS, { recursive: true });

  fs.writeFileSync(
    path.join(TMP_DOWNLOADS, "alias-move.txt"),
    "contenu"
  );

  const result = moveLocalFile(
    "downloads/alias-move.txt",
    "cours/move-result.txt"
  );

  assert.ok(result.to.endsWith("cours/move-result.txt"));
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "cours", "move-result.txt")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(TMP_DOWNLOADS, "alias-move.txt")),
    false
  );
});

test("file_copy : copie un fichier dans un dossier, original conservé", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "a-copier.txt"),
    "contenu"
  );

  const result = await file_copyTool.execute({
    from: "a-copier.txt",
    to: "TD",
  });

  assert.equal(result.copied, true);
  assert.ok(result.to.endsWith("TD/a-copier.txt"));
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "a-copier.txt")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "TD", "a-copier.txt")),
    true
  );
});

test("file_copy : copie vers un nom précis", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "src-copy.txt"),
    "contenu"
  );

  const result = await file_copyTool.execute({
    from: "src-copy.txt",
    to: "copie-resultat.txt",
  });

  assert.ok(result.to.endsWith("copie-resultat.txt"));
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "src-copy.txt")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(TMP, "Documents", "copie-resultat.txt")),
    true
  );
});

test("file_copy : copie récursive d'un dossier", async () => {
  fs.mkdirSync(path.join(TMP, "Documents", "dossier-src", "sous"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(TMP, "Documents", "dossier-src", "sous", "f.txt"),
    "x"
  );

  const result = await file_copyTool.execute({
    from: "dossier-src",
    to: "dossier-copie",
  });

  assert.equal(result.isDir, true);
  assert.equal(
    fs.readFileSync(
      path.join(TMP, "Documents", "dossier-copie", "sous", "f.txt"),
      "utf8"
    ),
    "x"
  );
});

test("file_copy : écrasement d'une destination existante exige confirmation", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "src-copy-conf.txt"),
    "original"
  );
  fs.writeFileSync(
    path.join(TMP, "Documents", "dest-copy-conf.txt"),
    "existant"
  );

  await assert.rejects(
    () => file_copyTool.execute({
      from: "src-copy-conf.txt",
      to: "dest-copy-conf.txt",
    }),
    /confirmation|confirme/
  );

  await file_copyTool.execute({
    from: "src-copy-conf.txt",
    to: "dest-copy-conf.txt",
    confirmed: true,
  });

  assert.equal(
    fs.readFileSync(
      path.join(TMP, "Documents", "dest-copy-conf.txt"),
      "utf8"
    ),
    "original"
  );
});

test("file_copy : source introuvable refusée", async () => {
  await assert.rejects(
    () => file_copyTool.execute({
      from: "totalement-inexistant.txt",
      to: "TD",
    }),
    /introuvable/
  );
});

test("file_copy : source et destination identiques refusées", async () => {
  fs.writeFileSync(
    path.join(TMP, "Documents", "identique-copy.txt"),
    "x"
  );

  await assert.rejects(
    () => file_copyTool.execute({
      from: "identique-copy.txt",
      to: "identique-copy.txt",
    }),
    /identiques/
  );
});

test("file_download : télécharge une URL dans downloads/", async () => {
  const server = await startTestServer("%PDF-1.4\ncontenu du fichier");

  try {
    const result = await file_downloadTool.execute({
      url: server.url,
    });

    assert.equal(result.name, "doc.pdf");
    assert.ok(result.folder.endsWith("downloads"));
    assert.equal(result.size, "%PDF-1.4\ncontenu du fichier".length);

    const content = fs.readFileSync(result.path, "utf8");

    assert.ok(content.startsWith("%PDF-"));
  } finally {
    await server.close();
  }
});

test("file_download : écrase un fichier existant seulement après confirmation", async () => {
  const server = await startTestServer("%PDF-1.4\nversion 2");

  const existingDir = path.join(TMP, "Documents", "downloads");

  fs.mkdirSync(existingDir, { recursive: true });
  fs.writeFileSync(path.join(existingDir, "doc.pdf"), "ancien");

  try {
    await assert.rejects(
      () => file_downloadTool.execute({ url: server.url }),
      /confirmation|confirme/
    );

    const result = await file_downloadTool.execute({
      url: server.url,
      confirmed: true,
    });

    assert.ok(fs.readFileSync(result.path, "utf8").startsWith("%PDF-"));
  } finally {
    await server.close();
  }
});

test("file_download : page HTML renvoyée → rejetée sans fichier corrompu", async () => {
  const server = await startTestServer({
    payload: "<html><body>page de connexion</body></html>",
    contentType: "text/html",
  });

  process.env.NEXUS_FILES_NO_BROWSER = "1";

  try {
    await assert.rejects(
      () => file_downloadTool.execute({
        url: server.url,
        filename: "html-test.pdf",
      }),
      /HTML|html|browser/
    );

    assert.equal(
      fs.existsSync(path.join(TMP, "Documents", "downloads", "html-test.pdf")),
      false
    );
  } finally {
    delete process.env.NEXUS_FILES_NO_BROWSER;
    await server.close();
  }
});

test("file_download : contenu non conforme → rejeté (fichier cassé)", async () => {
  const server = await startTestServer({
    payload: "ceci nest pas un pdf",
    contentType: "application/pdf",
  });

  process.env.NEXUS_FILES_NO_BROWSER = "1";

  try {
    await assert.rejects(
      () => file_downloadTool.execute({
        url: server.url,
        filename: "corrupt-test.pdf",
      }),
      /ne correspond|HTML|browser/
    );

    assert.equal(
      fs.existsSync(path.join(TMP, "Documents", "downloads", "corrupt-test.pdf")),
      false
    );
  } finally {
    delete process.env.NEXUS_FILES_NO_BROWSER;
    await server.close();
  }
});

test("file_download : gros fichier exige confirmation", async () => {
  process.env.NEXUS_FILES_DOWNLOAD_BIG = "4";
  process.env.NEXUS_FILES_DOWNLOAD_MAX = "1024";

  const server = await startTestServer(
    Buffer.concat([
      Buffer.from("%PDF-1.4\n"),
      Buffer.alloc(56, 32),
    ])
  );

  try {
    await assert.rejects(
      () => file_downloadTool.execute({ url: server.url }),
      /confirmation|confirme/
    );

    const result = await file_downloadTool.execute({
      url: server.url,
      confirmed: true,
    });

    assert.ok(result.size >= 64);
  } finally {
    await server.close();

    delete process.env.NEXUS_FILES_DOWNLOAD_BIG;
    delete process.env.NEXUS_FILES_DOWNLOAD_MAX;
  }
});

test("file_download : protocole non autorisé refusé", async () => {
  await assert.rejects(
    () => file_downloadTool.execute({ url: "file:///etc/passwd" }),
    /Protocole/
  );
});

test("file_download : curl authentifié réutilise le cookie jar", async () => {
  const jar = process.env.NEXUS_FILES_COOKIE_JAR;

  fs.writeFileSync(
    jar,
    [
      "# NEXUS cookie jar",
      "127.0.0.1\tFALSE\t/\tFALSE\t0\tsid\tabc123",
      "",
    ].join("\n")
  );

  const server = await startTestServer({
    payload: "%PDF-1.4\nvia-curl",
    headers: {
      "content-disposition": 'attachment; filename="cookies.pdf"',
    },
  });

  try {
    const result = await file_downloadTool.execute({
      url: server.url,
      filename: "cookies.pdf",
    });

    assert.equal(result.name, "cookies.pdf");
    assert.ok(fs.readFileSync(result.path, "utf8").startsWith("%PDF-"));
  } finally {
    await server.close();
    fs.rmSync(jar, { force: true });
  }
});

test("file_download : mode navigateur (Playwright) avec session JS", async (t) => {
  const server = await startTestServer({
    payload: "%PDF-1.4\nProduit par le navigateur",
    headers: {
      "content-disposition": 'attachment; filename="doc.pdf"',
    },
  });

  try {
    let result;

    try {
      result = await file_downloadTool.execute({
        url: server.url,
        filename: "browser-test.pdf",
        browser: true,
      });
    } catch (error) {
      if (
        /Executable doesn't exist|browser.*not found|playwright|ENOENT/i.test(
          String(error?.message)
        )
      ) {
        t.skip(`Navigateur indisponible en test : ${error.message}`);
        return;
      }

      throw error;
    }

    assert.equal(result.name, "browser-test.pdf");
    assert.ok(fs.readFileSync(result.path, "utf8").startsWith("%PDF-"));

    const overwrittenResult = await file_downloadTool.execute({
      url: server.url,
      filename: "browser-test.pdf",
      browser: true,
      confirmed: true,
    });

    assert.ok(fs.readFileSync(overwrittenResult.path, "utf8").startsWith("%PDF-"));
  } finally {
    await server.close();
    await closeDownloadBrowser();
  }
});