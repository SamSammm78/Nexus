import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import {
  join,
  dirname,
  resolve,
} from "node:path";
import {
  homedir,
} from "node:os";
import {
  fileURLToPath,
} from "node:url";

const CONFIG_FILE =
  process.env.NEXUS_FILES_CONFIG
    ? resolve(process.env.NEXUS_FILES_CONFIG)
    : fileURLToPath(
        new URL(
          "../../../data/files-config.json",
          import.meta.url
        )
      );

const SOURCE_PRIORITIES = [
  "local",
  "drive",
];

function defaultRoot() {
  return join(homedir(), "Documents");
}

function readConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return {};
    }

    const parsed = JSON.parse(
      readFileSync(CONFIG_FILE, "utf8")
    );

    return parsed &&
      typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  try {
    mkdirSync(dirname(CONFIG_FILE), {
      recursive: true,
    });

    writeFileSync(
      CONFIG_FILE,
      JSON.stringify(
        { ...readConfig(), ...patch },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // La config ne doit jamais bloquer les outils.
  }
}

export function resolveRoot() {
  const configured =
    process.env.NEXUS_FILES_ROOT?.trim() ||
    readConfig().root;

  if (!configured) {
    return defaultRoot();
  }

  const expanded =
    configured.replace(
      /^~(?=\/|$)/,
      homedir()
    );

  return resolve(expanded);
}

export function getFilesSettings() {
  const priority =
    readConfig().sourcePriority;

  return {
    root: resolveRoot(),
    sourcePriority: SOURCE_PRIORITIES.includes(priority)
      ? priority
      : "local",
  };
}

export function setFilesRoot(root) {
  const value = String(root ?? "")
    .trim();

  if (!value) {
    throw new Error(
      "Chemin de racine vide."
    );
  }

  writeConfig({
    root: value.replace(
      /^~(?=\/|$)/,
      homedir()
    ),
  });

  return resolveRoot();
}

export function setFilesPriority(priority) {
  if (!SOURCE_PRIORITIES.includes(priority)) {
    throw new Error(
      `Priorité invalide : ${priority} ` +
      `(attendu : ${SOURCE_PRIORITIES.join(" / ")})`
    );
  }

  writeConfig({ sourcePriority: priority });

  return priority;
}