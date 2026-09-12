// ============================================================
// EMBEDDINGS HYBRIDES
// ------------------------------------------------------------
// Deux stratégies, mêmes signatures (asynchrones) :
//  - "ollama" : embeddings vectoriels réels via Ollama local
//               (NEXUS_EMBED_URL / NEXUS_EMBED_MODEL).
//  - "local"  : feature hashing déterministe (sans réseau,
//               borné à DIM dimensions, normalisé L2).
//
// Mode : NEXUS_EMBED_MODE = auto (défaut) | local | ollama
// En "auto", on sonde Ollama une fois ; sinon repli local.
// ============================================================

const DIM = 512;

const EMBED_MODE_ENV = "NEXUS_EMBED_MODE";
const EMBED_URL_ENV = "NEXUS_EMBED_URL";
const EMBED_MODEL_ENV = "NEXUS_EMBED_MODEL";

const DEFAULT_URL = "http://localhost:11434";
const DEFAULT_MODEL = "nomic-embed-text";

export const EMBED_DIM = DIM;

const STOP_WORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "d", "l",
  "sur", "dans", "pour", "avec", "sans", "par", "en", "au", "aux",
  "et", "ou", "mais", "donc", "que", "qui", "est", "the", "a", "an",
  "of", "and", "or", "to", "in", "on", "at", "this", "that",
  "utilisateur", "user", "nexus", "note", "notes",
  "mémoire", "memoire", "souvenir", "avoir", "être", "etre",
  "fait", "faire", "peut", "avec", "aussi", "plus", "tout",
]);

let resolvedMode = null;

const localCache = new Map();
const ollamaCache = new Map();


export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(token => token.length >= 3)
    .filter(token => !STOP_WORDS.has(token));
}


function intHash(text, seed) {
  let hash = (2166136261 ^ seed) >>> 0;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}


function localEmbed(text) {
  const vector = new Float32Array(DIM);

  const tokens = tokenize(text);
  const counts = new Map();

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  for (const [token, count] of counts) {
    const weight = Math.sqrt(count);

    for (const seed of [1, 2, 3, 4]) {
      const index = intHash(token, seed) % DIM;
      const sign =
        intHash(token, 40 + seed) & 1
          ? 1
          : -1;

      vector[index] += sign * weight;
    }
  }

  return normalize(vector);
}


function normalize(vector) {
  let norm = 0;

  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }

  norm = Math.sqrt(norm) || 1;

  for (let i = 0; i < vector.length; i++) {
    vector[i] /= norm;
  }

  return vector;
}


async function probeOllama() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      800
    );

    const url =
      (process.env[EMBED_URL_ENV]?.trim() || DEFAULT_URL) +
      "/api/tags";

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timer);

    return response.ok;
  } catch {
    return false;
  }
}


async function ollamaEmbed(text) {
  const base =
    process.env[EMBED_URL_ENV]?.trim() || DEFAULT_URL;

  const model =
    process.env[EMBED_MODEL_ENV]?.trim() || DEFAULT_MODEL;

  try {
    const response = await fetch(
      `${base}/api/embed`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [text],
        }),
      }
    );

    if (!response.ok) {
      return fallbackLocal(text);
    }

    const data = await response.json();

    const embedding = data?.embeddings?.[0];

    if (
      !Array.isArray(embedding) ||
      embedding.length === 0
    ) {
      return fallbackLocal(text);
    }

    resolvedMode = "ollama";

    return normalize(
      Float32Array.from(embedding)
    );
  } catch {
    return fallbackLocal(text);
  }
}


function fallbackLocal(text) {
  resolvedMode = "local";
  return localEmbed(text);
}


// Détermine la stratégie d'embedding (une fois, paresseusement).
async function resolveMode() {
  if (resolvedMode) return resolvedMode;

  const requested =
    (process.env[EMBED_MODE_ENV] ?? "auto")
      .trim()
      .toLowerCase();

  if (requested === "local") {
    resolvedMode = "local";
    return resolvedMode;
  }

  if (requested === "ollama") {
    resolvedMode = "ollama";
    return resolvedMode;
  }

  const reachable = await probeOllama();

  resolvedMode = reachable ? "ollama" : "local";

  return resolvedMode;
}


export async function embedText(text) {
  const key = String(text ?? "").trim();

  if (!key) {
    return new Float32Array(DIM);
  }

  const mode = await resolveMode();

  if (mode === "ollama") {
    if (ollamaCache.has(key)) {
      return ollamaCache.get(key);
    }

    const vector = await ollamaEmbed(key);

    ollamaCache.set(key, vector);

    return vector;
  }

  if (localCache.has(key)) {
    return localCache.get(key);
  }

  const vector = localEmbed(key);

  localCache.set(key, vector);

  return vector;
}


export function dotProduct(a, b) {
  let sum = 0;

  const length = Math.min(a.length, b.length);

  for (let i = 0; i < length; i++) {
    sum += a[i] * b[i];
  }

  return sum;
}


export function cosineSimilarity(a, b) {
  const dot = dotProduct(a, b);

  if (!Number.isFinite(dot)) return 0;

  // Vecteurs normalisés : le cosinus ≈ produit scalaire.
  return Math.max(-1, Math.min(1, dot));
}