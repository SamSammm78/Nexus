import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import path from "node:path";
import {
  fileURLToPath,
} from "node:url";


const DEFAULT_PLACES_FILE =
  fileURLToPath(
    new URL(
      "../../../data/places.json",
      import.meta.url
    )
  );

function placesFile() {
  return (
    process.env.NEXUS_PLACES_FILE
      ? path.resolve(process.env.NEXUS_PLACES_FILE)
      : DEFAULT_PLACES_FILE
  );
}


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
// LECTURE / ÉCRITURE
// ======================================================

export function listPlaces() {
  try {
    if (!existsSync(placesFile())) {
      return [];
    }

    const parsed =
      JSON.parse(
        readFileSync(placesFile(), "utf8")
      );

    return Array.isArray(parsed)
      ? parsed
          .filter(
            place =>
              place &&
              typeof place === "object" &&
              place.name
          )
          .sort(
            (a, b) =>
              normalizePlaceName(a.name)
                .localeCompare(
                  normalizePlaceName(b.name)
                )
          )
      : [];
  } catch {
    return [];
  }
}


function writePlaces(places) {
  mkdirSync(
    path.dirname(placesFile()),
    { recursive: true }
  );

  writeFileSync(
    placesFile(),
    JSON.stringify(places, null, 2),
    "utf8"
  );
}


// ======================================================
// RECHERCHE
// ======================================================

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

  const now = new Date().toISOString();
  const places = listPlaces();

  const existing = places.find(
    place =>
      normalizePlaceName(place.name) === key
  );

  let place;

  if (existing) {
    place = {
      ...existing,
      name,
      label:
        label ?? existing.label ?? address ?? name,
      latitude,
      longitude,
      address: address ?? existing.address ?? null,
      updatedAt: now,
    };

    places[places.indexOf(existing)] = place;
  } else {
    place = {
      name,
      label:
        label ?? address ?? name,
      latitude,
      longitude,
      address: address ?? null,
      createdAt: now,
      updatedAt: now,
    };

    places.push(place);
  }

  writePlaces(places);

  return place;
}


// ======================================================
// SUPPRESSION
// ======================================================

export function removePlace(name) {
  const key = normalizePlaceName(name);

  if (!key) {
    return false;
  }

  const places = listPlaces();
  const next = places.filter(
    place =>
      normalizePlaceName(place.name) !== key
  );

  if (next.length === places.length) {
    return false;
  }

  writePlaces(next);

  return true;
}