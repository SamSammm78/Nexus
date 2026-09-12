import { Type } from "@google/genai";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  callMcpTool,
} from "../mcp/client.js";

import {
  getNexusDownloadDir,
  sanitizeFilename,
  getUniqueFilename,
  isNoActivePage,
} from "./download.js";


const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 120_000;
const PDF_MAGIC = "%PDF-";


// ============================================================
// CODE EXÉCUTÉ DANS LE NAVIGATEUR (browser_run_code_unsafe)
// ============================================================
//
// `browser_run_code_unsafe` exécute le code dans un contexte vm du
// processus serveur Playwright MCP, avec uniquement `page` injecté
// (c'est lui qui détient la session, les cookies et le token par défaut).
// On récupère donc le PDF via `page.request` (APIRequestContext du
// contexte, comme `context.request`) qui partage les cookies de session.
// Pour une URL `blob:`, on fait un `fetch` dans la page elle-même.
//
// Attention : ce bloc ne doit contenir ni backtick ni `${` (il est
// inséré tel quel dans un template literal du fichier).

const PDF_CANDIDATE_CODE = buildPdfCandidateCode();

function buildPdfCandidateCode() {
  return `
async (page) => {
  var candidates = [];
  var topUrl = page.url();
  if (topUrl && !/^(about|chrome|devtools|chrome-extension):/i.test(topUrl)) {
    candidates.push(topUrl);
  }
  try {
    var found = await page.evaluate(function () {
      var out = [];
      var push = function (s) { if (s) { try { out.push(new URL(s, location.href).href); } catch (e) {} } };
      var iframes = document.querySelectorAll('iframe[src]');
      for (var i = 0; i < iframes.length; i++) push(iframes[i].getAttribute('src'));
      var embeds = document.querySelectorAll('embed[src]');
      for (var i = 0; i < embeds.length; i++) push(embeds[i].getAttribute('src'));
      var objects = document.querySelectorAll('object[data]');
      for (var i = 0; i < objects.length; i++) push(objects[i].getAttribute('data'));
      return out;
    });
    for (var j = 0; j < found.length; j++) {
      if (candidates.indexOf(found[j]) === -1) candidates.push(found[j]);
    }
  } catch (e) {}
  if (candidates.length === 0) {
    return { ok: false, error: 'no candidates', candidates: [] };
  }
  var lastErr = null;
  for (var k = 0; k < candidates.length; k++) {
    var candidate = candidates[k];
    var isPdf = false;
    var contentType = '';
    var disposition = '';
    var status = 0;
    var length = 0;
    var b64 = null;
    if (candidate.indexOf('blob:') === 0) {
      try {
        var blobRes = await page.evaluate(function (u) {
          return fetch(u).then(function (r) {
            return r.arrayBuffer().then(function (b) {
              var bytes = new Uint8Array(b);
              var bin = '';
              for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              return {
                type: r.headers.get('content-type') || '',
                status: r.status,
                b64: btoa(bin),
                length: bytes.length,
                pdf: bin.slice(0, 5) === '%PDF-'
              };
            });
          });
        }, candidate);
        contentType = blobRes.type;
        status = blobRes.status;
        b64 = blobRes.b64;
        length = blobRes.length;
        isPdf = blobRes.pdf;
      } catch (e) {
        var firstBlobErr = 'blob inline: ' + (e && e.message ? e.message : String(e));
        if (!isPdf) {
          var np = null;
          try {
            var rest = candidate.indexOf('blob:') === 0 ? candidate.slice(5) : '';
            var origin = '';
            var dSlash = rest.indexOf('//');
            if (rest && dSlash !== -1) {
              var afterHost = rest.indexOf('/', dSlash + 2);
              origin = afterHost !== -1 ? rest.slice(0, afterHost) : rest;
            }
            if (origin) {
              np = await page.context().newPage();
              await np.goto(origin + '/', { timeout: 15000 });
              var b2 = await np.evaluate(function (u) {
                return fetch(u).then(function (r) {
                  return r.arrayBuffer().then(function (b) {
                    var bytes = new Uint8Array(b);
                    var bin = '';
                    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                    return {
                      type: r.headers.get('content-type') || '',
                      status: r.status,
                      b64: btoa(bin),
                      length: bytes.length,
                      pdf: bin.slice(0, 5) === '%PDF-'
                    };
                  });
                });
              }, candidate);
              contentType = b2.type;
              status = b2.status;
              b64 = b2.b64;
              length = b2.length;
              isPdf = b2.pdf;
            }
          } catch (e2) {
            firstBlobErr = 'blob fallback: ' + (e2 && e2.message ? e2.message : String(e2));
          } finally {
            if (np) { try { await np.close(); } catch (e3) {} }
          }
        }
        if (!isPdf) {
          lastErr = firstBlobErr;
          continue;
        }
      }
    } else {
      try {
        var resp = await page.request.get(candidate, { failOnStatusCode: false, timeout: 30000 });
        contentType = resp.headers()['content-type'] || '';
        disposition = resp.headers()['content-disposition'] || '';
        status = resp.status();
        var buf = await resp.body();
        b64 = buf.toString('base64');
        length = buf.length;
        isPdf = buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-';
      } catch (e) {
        lastErr = 'request: ' + (e && e.message ? e.message : String(e));
        continue;
      }
    }
    if (isPdf) {
      return {
        ok: true,
        url: candidate,
        contentType: contentType,
        disposition: disposition,
        status: status,
        length: length,
        b64: b64
      };
    }
    lastErr = (contentType || 'sans type') + ' status=' + status;
    b64 = null;
  }
  return { ok: false, candidates: candidates, error: lastErr };
}
`;
}


// ============================================================
// HELPERS
// ============================================================

export function pdfCandidateCode() {
  return PDF_CANDIDATE_CODE;
}


export function parseContentDisposition(disposition) {
  if (!disposition) {
    return null;
  }

  const utf8Match = disposition.match(
    /filename\*\s*=\s*UTF-8''([^;]+)/i
  );

  if (utf8Match) {
    try {
      const name = decodeURIComponent(utf8Match[1].trim());

      if (name) {
        return name.replace(/["<>]/g, "");
      }
    } catch {
      // ignore
    }
  }

  const plainMatch = disposition.match(
    /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i
  );

  if (plainMatch) {
    const name = (
      plainMatch[1] ?? plainMatch[2]
    ).trim();

    if (name) {
      return name.replace(/["<>]/g, "");
    }
  }

  return null;
}


export function filenameFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const base = decodeURIComponent(
      parsed.pathname.split("/").pop() ?? ""
    );

    if (base) {
      return base.split(/[?#]|$/)[0];
    }
  } catch {
    // ignore
  }

  return null;
}


export function extractJsonFromText(text) {
  if (!text) {
    return null;
  }

  const marker = "### Result";
  const idx = text.indexOf(marker);

  if (idx === -1) {
    return null;
  }

  const rest = text.slice(idx + marker.length);
  const end = rest.indexOf("### Ran Playwright code");
  const part = (
    end === -1
      ? rest
      : rest.slice(0, end)
  ).trim();

  if (!part) {
    return null;
  }

  try {
    const parsed = JSON.parse(part);

    // Le code peut renvoyer une chaîne JSON.stringify'd : on la déplie.
    if (typeof parsed === "string") {
      return JSON.parse(parsed);
    }

    return parsed;
  } catch {
    return null;
  }
}


export function ensurePdfExtension(name) {
  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return null;
  }

  const trimmed = name.trim();

  if (/\.pdf$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}.pdf`;
}


// ============================================================
// TOOL
// ============================================================

const browser_download_pdfTool = {
  declaration: {
    name: "browser_download_pdf",
    description:
      "Télécharge le PDF actuellement ouvert dans le navigateur (ex: « télécharge ce PDF », « enregistre le PDF ouvert », « télécharge le document ouvert »). Détecte la page PDF ouverte (URL directe, iframe/embed, ou blob:), récupère l'URL réelle, puis télécharge le fichier depuis cette URL en réutilisant la session Playwright (cookies et headers du contexte : PDF derrière authentification OK). Vérifie que la réponse est bien un PDF avant d'enregistrer. Le fichier est enregistré dans ~/Downloads/NEXUS avec le nom du PDF (headers ou URL), sans écraser un fichier existant (fichier (1).pdf en cas de doublon).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        filename: {
          type: Type.STRING,
          description:
            "Nom optionnel à donner au fichier (ex: 'cours-algebre.pdf'). Par défaut, le nom issu des headers HTTP ou de l'URL est conservé.",
        },
        timeout: {
          type: Type.NUMBER,
          description:
            "Timeout optionnel de la récupération en millisecondes (défaut 60000, maximum 120000).",
        },
      },
    },
  },

  async execute(args = {}) {
    const timeout = Math.min(
      Math.max(
        Number(args.timeout) || DEFAULT_TIMEOUT,
        5_000
      ),
      MAX_TIMEOUT
    );

    // --------------------------------------------------------
    // Page active ?
    // --------------------------------------------------------

    const snapshot = await mcp(
      "browser_snapshot",
      {}
    );

    if (!snapshot || snapshot.isError) {
      return pdfError(
        "DOWNLOAD_FAILED",
        "Le navigateur est indisponible."
      );
    }

    if (isNoActivePage(snapshot.text)) {
      return pdfError(
        "NO_ACTIVE_PAGE",
        "Aucune page ouverte. Navigue d'abord vers le PDF avec browser_navigate, puis réessaie."
      );
    }

    // --------------------------------------------------------
    // Récupération du PDF dans le navigateur (session conservée)
    // --------------------------------------------------------

    console.log(
      "[NEXUS Browser] Récupération du PDF ouvert..."
    );

    const response = await runCode(
      PDF_CANDIDATE_CODE,
      timeout
    );

    if (!response) {
      return pdfError(
        "DOWNLOAD_TIMEOUT",
        `La récupération du PDF a dépassé ${timeout} ms.`
      );
    }

    if (response.isError) {
      return pdfError(
        "DOWNLOAD_FAILED",
        response.message ?? response.text
      );
    }

    let data = extractJsonFromText(response.text);

    if (!data && !response.isError) {
      return pdfError(
        "DOWNLOAD_FAILED",
        "Réponse inattendue du navigateur pendant la récupération du PDF."
      );
    }

    if (!data?.ok) {
      return pdfError(
        "PDF_NOT_FOUND",
        `La page ouverte ne correspond pas à un PDF : ${data?.error ?? "aucune source PDF trouvée"}.`
      );
    }

    // --------------------------------------------------------
    // Nom du fichier et destination
    // --------------------------------------------------------

    const httpName = parseContentDisposition(data.disposition);
    const urlName = filenameFromUrl(data.url);
    const suggested = httpName ?? urlName ?? "document.pdf";

    let finalName = sanitizeFilename(
      ensurePdfExtension(suggested)
    );

    if (args.filename) {
      const customName = sanitizeFilename(
        ensurePdfExtension(String(args.filename))
      );

      if (!customName) {
        return pdfError(
          "INVALID_FILENAME",
          `Le nom de fichier fourni est invalide : « ${args.filename} ».`
        );
      }

      finalName = customName;
    }

    if (!finalName) {
      return pdfError(
        "DOWNLOAD_FAILED",
        "Le nom du PDF récupéré est invalide."
      );
    }

    // --------------------------------------------------------
    // Vérification finale et enregistrement (~/Downloads/NEXUS)
    // --------------------------------------------------------

    const buffer = Buffer.from(data.b64 ?? "", "base64");

    if (!buffer.subarray(0, PDF_MAGIC.length).toString("latin1").startsWith(PDF_MAGIC)) {
      return pdfError(
        "PDF_NOT_FOUND",
        "La réponse téléchargée n'est pas un PDF valide."
      );
    }

    const destDir = getNexusDownloadDir();
    const destName = getUniqueFilename(destDir, finalName);
    const dest = path.join(destDir, destName);

    fs.writeFileSync(dest, buffer);

    const size = fs.statSync(dest).size;

    console.log(
      `[NEXUS Browser] PDF enregistré : ${dest}`
    );

    return {
      success: true,
      filename: destName,
      path: dest,
      extension: ".pdf",
      size,
      message: "PDF téléchargé avec succès.",
    };
  },
};

export const pdfTools = [
  browser_download_pdfTool,
];


// ============================================================
// INTERNAL
// ============================================================

async function mcp(toolName, args) {
  try {
    const response = await callMcpTool(
      "playwright",
      toolName,
      args
    );

    return {
      isError: !!response.isError,
      text: response.content?.[0]?.text ?? "",
      message: response.content?.[0]?.text ?? "",
    };
  } catch (error) {
    return {
      isError: true,
      text: "",
      message: error?.message ?? String(error),
    };
  }
}


async function runCode(code, timeout) {
  let timer;

  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => {
      resolve(null);
    }, timeout);
  });

  const race = await Promise.race([
    mcp("browser_run_code_unsafe", { code }),
    timeoutPromise,
  ]);

  clearTimeout(timer);

  return race;
}


function pdfError(error, message) {
  console.log(
    `[NEXUS Browser] Échec PDF : ${message}`
  );

  return {
    success: false,
    error,
    message,
  };
}