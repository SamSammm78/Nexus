import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initProject,
  setProjectHub,
  projectCheckpoint,
  projectLog,
  projectResume,
  listProjects,
  findProjectHub,
} from "../memory/brain.js";

const vault = mkdtempSync(join(tmpdir(), "nexus-copilot-"));

process.env.NEXUS_VAULT = vault;

test("project_init crée la souche + l'index", () => {
  const hub = initProject({
    name: "Jardin",
    goal: "Faire pousser des tomates bio.",
  });

  assert.equal(hub.type, "project");
  assert.equal(hub.status, "active");
  assert.equal(hub.goal, "Faire pousser des tomates bio.");

  const indexFile = join(vault, "projets", "_index.md");
  assert.equal(existsSync(indexFile), true);

  const index = readFileSync(indexFile, "utf8");
  assert.match(index, /Jardin/);
});

test("project_set met à jour le frontmatter du hub", () => {
  const hub = setProjectHub("Jardin", {
    status: "active",
    milestones: "Semis, Récolte, Conservation",
    nextAction: "Acheter les graines de tomates.",
  });

  assert.equal(hub.milestones, "Semis, Récolte, Conservation");
  assert.equal(hub.nextAction, "Acheter les graines de tomates.");
});

test("project_log écrit activité et décision liées au projet", () => {
  const activity = projectLog({
    projectId: "Jardin",
    kind: "activity",
    content: "Préparé les bacs à semis.",
  });
  assert.equal(activity.type, "event");
  assert.equal(activity.projectId, "Jardin");

  const decision = projectLog({
    projectId: "Jardin",
    kind: "decision",
    content: "Choisir des tomates cœur de bœuf.",
  });
  assert.equal(decision.type, "decision");
});

test("project_checkpoint chaîne les checkpoints et met à jour lastCheckpoint", () => {
  const first = projectCheckpoint({
    projectId: "Jardin",
    summary: "Bacs prêts, semis planifiés.",
    nextAction: "Semer fin mai.",
  });
  assert.equal(first.type, "checkpoint");
  assert.equal(first.parent, null);

  const second = projectCheckpoint({
    projectId: "Jardin",
    summary: "Semis réalisés.",
  });
  assert.equal(second.parent, first.id);

  const hub = findProjectHub("Jardin");
  assert.equal(hub.lastCheckpoint, String(second.created).slice(0, 10));
  assert.equal(hub.nextAction, "Semer fin mai.");
});

test("project_resume agrège hub + log", () => {
  const resume = projectResume("Jardin");

  assert.equal(resume.projectId, "Jardin");
  assert.equal(resume.status, "active");
  assert.equal(resume.nextAction, "Semer fin mai.");
  assert.equal(resume.decisions.length, 1);
  assert.equal(resume.recentEvents.length, 1);
  assert.equal(resume.checkpoints.length, 2);
});

test("listProjects liste les soutches", () => {
  const projects = listProjects();

  assert.ok(projects.some(p => p.name === "Jardin"));
  assert.ok(projects.every(p => p.status));
});

test("les notes liées au projet pointent vers la souche", () => {
  const checkpoint = findProjectHub("Jardin");
  assert.ok(checkpoint);
});

test("nettoyage", () => {
  rmSync(vault, { recursive: true, force: true });
});