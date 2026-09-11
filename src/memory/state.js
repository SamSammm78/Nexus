import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROJECT = "NEXUS";

const STATE_FILE =
  fileURLToPath(
    new URL("../../data/nexus-state.json", import.meta.url)
  );

function readState() {
  try {
    if (!existsSync(STATE_FILE)) return {};

    const parsed = JSON.parse(
      readFileSync(STATE_FILE, "utf8")
    );

    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function writeState(patch) {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });

    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        { ...readState(), ...patch },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // L'état ne doit jamais bloquer le CLI.
  }
}

export function getActiveProject() {
  const project = readState().project;

  return typeof project === "string" &&
    project.trim().length > 0
    ? project.trim()
    : DEFAULT_PROJECT;
}

export function setActiveProject(name) {
  const project =
    String(name ?? "")
      .trim()
      .slice(0, 40) || DEFAULT_PROJECT;

  writeState({ project });

  return project;
}