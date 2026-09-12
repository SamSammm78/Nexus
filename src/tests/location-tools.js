import {
  test,
} from "node:test";

import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";

import {
  normalizePlaceName,
  listPlaces,
  getPlace,
  savePlace,
  removePlace,
} from "../services/location/store.js";

import {
  haversineKm,
} from "../services/location/geo.js";

import {
  resolveLocation,
} from "../tools/location.js";

import {
  initBrain,
  listMemories,
  memoryStats,
} from "../memory/brain.js";


const VAULT = path.join(
  os.tmpdir(),
  `nexus-location-tests-${Date.now()}`
);

process.env.NEXUS_VAULT = VAULT;

initBrain();


test.after(async () => {
  const { rmSync } = await import("node:fs");
  rmSync(VAULT, { recursive: true, force: true });
});


// ======================================================
// STUB FETCH (hors-ligne, déterministe)
// ======================================================

function stubFetch() {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);

    const json = (body, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      async json() { return body; },
      async text() { return JSON.stringify(body); },
    });

    if (target.includes("ipapi.co/json")) {
      return json({
        latitude: "48.8566",
        longitude: "2.3522",
        city: "Paris",
        region: "Île-de-France",
        country_name: "France",
        country_code: "FR",
        ip: "1.2.3.4",
      });
    }

    if (target.includes("ip-api.com/json")) {
      return json({
        status: "success",
        lat: "45.764",
        lon: "4.8357",
        city: "Lyon",
        regionName: "Auvergne-Rhône-Alpes",
        country: "France",
        countryCode: "FR",
        query: "1.2.3.4",
      });
    }

    if (target.includes("geocode/search")) {
      return json({
        features: [{
          geometry: { coordinates: [2.3522, 48.8566] },
          properties: { label: "Paris, France" },
        }],
      });
    }

    if (target.includes("geocode/reverse")) {
      return json({
        features: [{
          properties: { label: "Paris, France" },
        }],
      });
    }

    return realFetch(url, options);
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}


// ======================================================
// NORMALISATION
// ======================================================

test("normalizePlaceName : casse, espaces, trim", () => {
  assert.equal(normalizePlaceName("  MAISON "), "maison");
  assert.equal(normalizePlaceName("   Travail  "), "travail");
  assert.equal(normalizePlaceName("  Le   Gym  "), "le gym");
  assert.equal(normalizePlaceName(""), "");
  assert.equal(normalizePlaceName(null), "");
});


// ======================================================
// STORE (via cerveau)
// ======================================================

test("store : liste vide au départ", () => {
  assert.deepEqual(listPlaces(), []);
});


test("store : savePlace crée une note de type place dans le cerveau", () => {
  const place = savePlace({
    name: "Maison",
    label: "Rue de Rivoli, Paris, France",
    latitude: 48.8637,
    longitude: 2.3322,
    address: "12 rue de Rivoli, Paris",
  });

  assert.equal(place.name, "Maison");
  assert.equal(place.latitude, 48.8637);
  assert.ok(place.createdAt);

  const found = getPlace("maison");

  assert.ok(found);
  assert.equal(found.label, "Rue de Rivoli, Paris, France");
  assert.equal(found.address, "12 rue de Rivoli, Paris");

  const stats = memoryStats();

  assert.ok(stats.byType.place >= 1, "type 'place' présent dans le cerveau");
});


test("store : getPlace est insensible à la casse et aux espaces", () => {
  savePlace({
    name: "Travail",
    latitude: 48.8907,
    longitude: 2.2415,
    label: "La Défense, Puteaux, France",
  });

  assert.ok(getPlace("  TRAVAIL "));
  assert.equal(getPlace("travail").name, "Travail");
});


test("store : savePlace met à jour sans dupliquer", () => {
  savePlace({
    name: "maison",
    latitude: 48.865,
    longitude: 2.333,
    label: "12 rue de Rivoli, Paris 3e",
  });

  const places = listPlaces();

  assert.equal(places.length, 2);

  const maison = getPlace("maison");

  assert.equal(maison.latitude, 48.865);
  assert.equal(maison.label, "12 rue de Rivoli, Paris 3e");
  assert.ok(maison.updatedAt !== maison.createdAt);
});


test("store : une place est lisible comme note mémoire", () => {
  const notes = listMemories({ type: "place", limit: 10 });

  const note = notes.find(
    n => normalizePlaceName(n.title) === "maison"
  );

  assert.ok(note);
  assert.equal(note.type, "place");
  assert.equal(note.latitude, 48.865);
  assert.equal(note.address, "12 rue de Rivoli, Paris");
  assert.ok(note.content.includes("Lieu personnel"));
});


test("store : removePlace supprime la note du cerveau", () => {
  assert.equal(removePlace("inconnu"), false);
  assert.equal(removePlace("maison"), true);
  assert.equal(getPlace("maison"), null);
  assert.equal(listPlaces().length, 1);

  const notes = listMemories({ type: "place", limit: 10 });

  assert.ok(!notes.some(n => n.title === "Maison"));
});


test("store : savePlace rejette les entrées invalides", () => {
  assert.throws(() => {
    savePlace({ name: "", latitude: 1, longitude: 2 });
  });

  assert.throws(() => {
    savePlace({ name: "x", latitude: "a", longitude: 2 });
  });
});


// ======================================================
// DISTANCE (haversine pure)
// ======================================================

test("haversineKm : Paris–Lyon ≈ 390-450 km", () => {
  const km = haversineKm(
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 45.764, longitude: 4.8357 }
  );

  assert.ok(km > 390 && km < 450, `km = ${km}`);
});


test("haversineKm : distance nulle entre deux points identiques", () => {
  const km = haversineKm(
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 48.8566, longitude: 2.3522 }
  );

  assert.ok(Math.abs(km) < 0.001);
});


// ======================================================
// RÉSOLUTION DE LIEU
// ======================================================

test("resolveLocation : 'current' → position actuelle stub", async () => {
  const restore = stubFetch();

  try {
    const resolved = await resolveLocation("current");

    assert.equal(resolved.source, "current");
    assert.equal(resolved.latitude, 48.8566);
    assert.equal(resolved.longitude, 2.3522);

    const ici = await resolveLocation("ma position");

    assert.equal(ici.source, "current");
  } finally {
    restore();
  }
});


test("resolveLocation : lieu enregistré → source 'saved'", async () => {
  savePlace({
    name: "Maison",
    latitude: 48.865,
    longitude: 2.333,
    label: "12 rue de Rivoli, Paris 3e",
    address: "12 rue de Rivoli, Paris",
  });

  const resolved = await resolveLocation("MAISON");

  assert.equal(resolved.source, "saved");
  assert.equal(normalizePlaceName(resolved.name), "maison");
  assert.equal(resolved.latitude, 48.865);
});


test("resolveLocation : valeur inconnue → géocodage", async () => {
  const restore = stubFetch();

  try {
    const resolved = await resolveLocation("un lieu inconnu");

    assert.equal(resolved.source, "geocoded");
    assert.equal(resolved.label, "Paris, France");
  } finally {
    restore();
  }
});


test("resolveLocation : 'current' ignoré si useCurrent=false", async () => {
  const restore = stubFetch();

  try {
    const resolved = await resolveLocation("current", { useCurrent: false });

    assert.equal(resolved.source, "geocoded");
  } finally {
    restore();
  }
});