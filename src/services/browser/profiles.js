import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  join,
} from "node:path";
import {
  homedir,
} from "node:os";

function nexusDataDir() {
  return (
    process.env.NEXUS_BROWSER_DATA_DIR?.trim() ||
    join(homedir(), ".nexus")
  );
}

// Profil Chrome persistant de NEXUS : les cookies de connexion y sont
// conservés d'une session à l'autre (compte étudiant, etc.).
export function browserProfileDir() {
  return (
    process.env.NEXUS_FILES_BROWSER_PROFILE?.trim() ||
    join(nexusDataDir(), "chrome-profile")
  );
}

// Fichier de cookies au format Netscape, réutilisé par curl pour des
// téléchargements authentifiés et rapides (sans navigateur).
export function cookieJarPath() {
  return (
    process.env.NEXUS_FILES_COOKIE_JAR?.trim() ||
    join(nexusDataDir(), "cookies.txt")
  );
}

export function cookieJarReady() {
  const file = cookieJarPath();

  if (!existsSync(file)) {
    return false;
  }

  try {
    // Un jar vide avec des commentaires ne suffit pas.
    return readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .length > 0;
  } catch {
    return false;
  }
}

function toNetscapeRow(cookie) {
  const domain =
    cookie.domain || "";
  const host =
    domain.startsWith(".")
      ? domain.slice(1)
      : domain;

  const dom =
    cookie.httpOnly
      ? `#HttpOnly_${host}`
      : host;

  const includeSubdomains =
    domain.startsWith(".")
      ? "TRUE"
      : "FALSE";

  return [
    dom,
    includeSubdomains,
    cookie.path || "/",
    cookie.secure ? "TRUE" : "FALSE",
    Math.floor(cookie.expires || 0),
    cookie.name,
    cookie.value,
  ].join("\t");
}

export function writeCookieJar(cookies = []) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return;
  }

  const file = cookieJarPath();

  mkdirSync(dirname(file), { recursive: true });

  const lines = [
    "# NEXUS cookie jar (format Netscape) — généré automatiquement",
    "",
    ...cookies.map(toNetscapeRow),
    "",
  ];

  const tmp = `${file}.tmp`;

  writeFileSync(tmp, lines.join("\n"), "utf8");

  renameSync(tmp, file);
}