// ======================================================
// SERVICE GÉO GRATUIT
//
// - Géocodage / géocodage inverse : OpenRouteService
// - Position actuelle : par IP (ipapi.co puis ip-api.com)
// - Distance en ligne droite : haversine
// - Itinéraire voiture : OpenRouteService
// ======================================================

const ORS_BASE =
  "https://api.openrouteservice.org";

const CURRENT_LOCATION_PROVIDERS = [
  async () => {
    const response =
      await fetch(
        "https://ipapi.co/json/"
      );

    if (!response.ok) {
      throw new Error(
        `ipapi.co HTTP ${response.status}`
      );
    }

    const data = await response.json();

    return {
      latitude:
        Number(data.latitude),
      longitude:
        Number(data.longitude),
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country_name ?? null,
      countryCode:
        data.country_code ?? null,
      ip: data.ip ?? null,
    };
  },
  async () => {
    const response =
      await fetch(
        "http://ip-api.com/json/?fields=status,message,lat,lon,city,regionName,country,countryCode,query"
      );

    if (!response.ok) {
      throw new Error(
        `ip-api.com HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (data.status !== "success") {
      throw new Error(
        data.message ?? "ip-api.com échec"
      );
    }

    return {
      latitude: Number(data.lat),
      longitude: Number(data.lon),
      city: data.city ?? null,
      region: data.regionName ?? null,
      country: data.country ?? null,
      countryCode:
        data.countryCode ?? null,
      ip: data.query ?? null,
    };
  },
];


// ======================================================
// FETCH ORS
// ======================================================

async function orsFetch(path, options = {}) {
  const response =
    await fetch(
      `${ORS_BASE}${path}`,
      {
        ...options,

        headers: {
          Authorization:
            process.env.ORS_API_KEY,

          "Content-Type":
            "application/json",

          ...(options.headers ?? {}),
        },
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `OpenRouteService HTTP ${response.status} : ${text.slice(0, 200)}`
    );
  }

  return await response.json();
}


// ======================================================
// GÉOCODAGE
// ======================================================

export async function geocode(query) {
  const text = String(query ?? "").trim();

  if (!text) {
    throw new Error("Lieu vide.");
  }

  const data =
    await orsFetch(
      `/geocode/search` +
        `?api_key=${process.env.ORS_API_KEY}` +
        `&text=${encodeURIComponent(text)}` +
        `&size=1`
    );

  const feature =
    data.features?.[0];

  if (!feature) {
    throw new Error(
      `Lieu introuvable : ${text}`
    );
  }

  const [
    longitude,
    latitude,
  ] =
    feature.geometry.coordinates;

  return {
    label:
      feature.properties?.label ??
      text,

    latitude:
      Number(latitude),

    longitude:
      Number(longitude),
  };
}


// ======================================================
// GÉOCODAGE INVERSE
// ======================================================

export async function reverseGeocode(
  latitude,
  longitude
) {
  const data =
    await orsFetch(
      `/geocode/reverse` +
        `?api_key=${process.env.ORS_API_KEY}` +
        `&point.lon=${longitude}` +
        `&point.lat=${latitude}` +
        `&size=1`
    );

  const feature =
    data.features?.[0];

  return (
    feature?.properties?.label ??
    `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  );
}


// ======================================================
// POSITION ACTUELLE (PAR IP)
// ======================================================

async function tryProviders(providers) {
  let lastError = null;

  for (const provider of providers) {
    try {
      return await provider();
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ??
    new Error("Localisation indisponible.")
  );
}

export async function fetchCurrentLocation() {
  return await tryProviders(
    CURRENT_LOCATION_PROVIDERS
  );
}


// ======================================================
// DISTANCE EN LIGNE DROITE (HAVERSINE)
// ======================================================

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (deg) =>
    (deg * Math.PI) / 180;

  const dLat =
    toRad(b.latitude - a.latitude);

  const dLon =
    toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.asin(Math.sqrt(h))
  );
}


// ======================================================
// ITINÉRAIRE VOITURE (ORS)
// ======================================================

export async function drivingBetween(a, b) {
  const data =
    await orsFetch(
      "/v2/directions/driving-car/geojson",
      {
        method: "POST",

        body:
          JSON.stringify({
            coordinates: [
              [a.longitude, a.latitude],
              [b.longitude, b.latitude],
            ],

            instructions: false,

            language: "fr",
          }),
      }
    );

  const route =
    data.features?.[0];

  if (!route) {
    throw new Error(
      "Aucun trajet routier trouvé."
    );
  }

  const summary =
    route.properties?.summary ?? {};

  return {
    distanceMeters:
      summary.distance ?? null,

    durationSeconds:
      summary.duration ?? null,
  };
}