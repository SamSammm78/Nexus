import {
  initBrain,
  rememberMemory,
  listMemories,
  updateMemory,
  forgetMemory,
} from "../../memory/brain.js";


// ======================================================
// NORMALISATION DES NOMS
// ======================================================

export function normalizePlaceName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


// ======================================================
// MAPPING NOTE → PLACE
// ======================================================

function noteToPlace(note) {
  return {
    id: note.id,
    name: note.title,
    label: note.label,
    latitude:
      typeof note.latitude === "number"
        ? note.latitude
        : null,
    longitude:
      typeof note.longitude === "number"
        ? note.longitude
        : null,
    address: note.address,
    createdAt: note.created,
    updatedAt: note.updated,
  };
}


// ======================================================
// LISTE / RECHERCHE
// ======================================================

export function listPlaces() {
  initBrain();

  return listMemories({
    type: "place",
    limit: 200,
  }).map(noteToPlace);
}


export function getPlace(name) {
  const key = normalizePlaceName(name);

  if (!key) {
    return null;
  }

  return (
    listPlaces().find(
      place =>
        normalizePlaceName(place.name) === key
    ) ?? null
  );
}


// ======================================================
// CRÉATION / MISE À JOUR
// ======================================================

export function savePlace({
  name,
  label,
  latitude,
  longitude,
  address,
}) {
  initBrain();

  const key = normalizePlaceName(name);

  if (!key) {
    throw new Error("Nom de lieu manquant.");
  }

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      "Coordonnées du lieu invalides (latitude/longitude numériques attendues)."
    );
  }

  const placeLabel = label ?? address ?? name;

  const content =
    `Lieu personnel : **${name}** — ` +
    `${placeLabel} ` +
    `(${latitude.toFixed(4)}, ${longitude.toFixed(4)}).`;

  const existing = getPlace(name);

  let note;

  if (existing) {
    note = updateMemory(existing.id, {
      title: name,
      content,
      label,
      address: address ?? existing.address,
      latitude,
      longitude,
    });
  } else {
    note = rememberMemory({
      type: "place",
      title: name,
      content,
      label,
      address,
      latitude,
      longitude,
      importance: 0.7,
      tags: ["lieu"],
    });
  }

  return noteToPlace(note);
}


// ======================================================
// SUPPRESSION
// ======================================================

export function removePlace(name) {
  const key = normalizePlaceName(name);

  if (!key) {
    return false;
  }

  const existing = getPlace(name);

  if (!existing) {
    return false;
  }

  return forgetMemory(existing.id);
}