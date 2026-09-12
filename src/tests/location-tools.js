import {
  test,
} from "node:test";

import assert from "node:assert/strict";

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import {
  listPlaces,
  getPlace,
  savePlace,
  removePlace,
  normalizePlaceName,
} from "../services/location/store.js";

import {
  haversineKm,
} from "../services/location/geo.js";

import {
  resolveLocation,
} from "../tools/location.js";


const PLACES_FILE =
  path.join(
    os.tmpdir(),
    `nexus-places-${process.pid}-${Date.now()}.json`
  );

process.env.NEXUS_PLACES_FILE = PLACES_FILE;


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

    if (target.includes("directions")) {
      return json({
        features: [{
          properties: {
            summary: {
              distance: 5000,
              duration: 600,
            },
          },
        }],
      });
    }

    return realFetch(url, options);
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}

function cleanup() {
  try {
    fs.rmSync(PLACES_FILE, { force: true });
  } catch {}
}

test.after(cleanup);


// ======================================================
// STORE
// ======================================================

test("store : liste vide au départ", () => {
  assert.deepEqual(listPlaces(), []);
});


test("store : savePlace crée et retrouve un lieu", () => {
  const place = savePlace({
    name: "Maison",
    label: "12 rue de Rivoli, Paris",
    latitude: 48.8566,
    longitude: 2.3522,
    address: "12 rue de Rivoli, Paris",
  });

  assert.equal(place.name, "Maison");
  assert.equal(place.latitude, 48.8566);
  assert.ok(place.createdAt);

  const found = getPlace("maison");

  assert.ok(found);
  assert.equal(found.label, "12 rue de Rivoli, Paris");
});


test("store : le nom est insensible à la casse et aux espaces", () => {
  savePlace({
    name: "Travail",
    latitude: 48.8738,
    longitude: 2.295,
    label: "La Défense",
  });

  assert.ok(getPlace("  TRAVAIL "));

  const found = getPlace("travail");

  assert.equal(found.name, "Travail");
  assert.equal(normalizePlaceName("  Ma   Maison "), "ma maison");
});


test("store : savePlace met à jour sans dupliquer", () => {
  savePlace({
    name: "maison",
    latitude: 48.1,
    longitude: 2.1,
    label: "Adresse mise à jour",
  });

  const places = listPlaces();

  assert.equal(places.length, 2);

  const maison = getPlace("maison");

  assert.equal(maison.latitude, 48.1);
  assert.equal(maison.label, "Adresse mise à jour");
  assert.ok(maison.updatedAt !== maison.createdAt);
});


test("store : removePlace supprime uniquement le bon lieu", () => {
  assert.equal(removePlace("inconnu"), false);
  assert.equal(removePlace("maison"), true);
  assert.equal(getPlace("maison"), null);
  assert.equal(listPlaces().length, 1);
});


test("store : savePlace rejette les coordonnées invalides", () => {
  assert.throws(() => {
    savePlace({ name: "x", latitude: "a", longitude: 2 });
  });

  assert.throws(() => {
    savePlace({ name: "", latitude: 1, longitude: 2 });
  });
});


// ======================================================
// DISTANCE
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

test("resolveLocation : 'current' / 'ma position' → position actuelle", async () => {
  savePlace({
    name: "maison",
    latitude: 48.8566,
    longitude: 2.3522,
    label: "Paris",
  });

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


test("resolveLocation : lieu enregistré prioritaire sur le géocodage", async () => {
  const resolved = await resolveLocation("MAISON");

  assert.equal(resolved.source, "saved");
  assert.equal(resolved.name, "maison");
  assert.equal(resolved.latitude, 48.8566);
});


test("resolveLocation : valeur inconnue → géocodage", async () => {
  const restore = stubFetch();

  try {
    const resolved = await resolveLocation("un quartier inconnu");

    assert.equal(resolved.source, "geocoded");
    assert.equal(resolved.label, "Paris, France");
    assert.equal(resolved.latitude, 48.8566);
  } finally {
    restore();
  }
});


test("resolveLocation : current ignoré quand useCurrent=false → géocodage", async () => {
  const restore = stubFetch();

  try {
    const resolved = await resolveLocation("current", { useCurrent: false });

    assert.equal(resolved.source, "geocoded");
  } finally {
    restore();
  }
});