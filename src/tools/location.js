import { Type } from "@google/genai";

import {
  listPlaces,
  getPlace,
  savePlace,
  removePlace,
} from "../services/location/store.js";

import {
  geocode,
  reverseGeocode,
  fetchCurrentLocation,
  haversineKm,
  drivingBetween,
} from "../services/location/geo.js";


// ======================================================
// HELPERS
// ======================================================

function formatDuration(seconds) {
  if (typeof seconds !== "number") {
    return null;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }

  return `${minutes} min`;
}

function formatDistanceKm(km) {
  if (typeof km !== "number") {
    return null;
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }

  if (km < 10) {
    return `${km.toFixed(1)} km`;
  }

  return `${Math.round(km)} km`;
}

const CURRENT_HINTS = [
  "current",
  "position actuelle",
  "ma position",
  "position",
  "ici",
  "là",
  "moi",
];

function isCurrentHint(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return CURRENT_HINTS.includes(text);
}


// ======================================================
// RÉSOLUTION D'UN LIEU
//
// Accepte : un lieu enregistré (place_*), "current"
// (position actuelle), ou une adresse libre.
// ======================================================

export async function resolveLocation(value, { useCurrent = true } = {}) {
  if (useCurrent && isCurrentHint(value)) {
    const current = await fetchCurrentLocation();

    const label =
      [current.city, current.region, current.country]
        .filter(Boolean)
        .join(", ");

    return {
      source: "current",
      label: label || "position actuelle",
      latitude: current.latitude,
      longitude: current.longitude,
    };
  }

  const saved = getPlace(value);

  if (saved) {
    return {
      source: "saved",
      name: saved.name,
      label: saved.label,
      latitude: saved.latitude,
      longitude: saved.longitude,
    };
  }

  const resolved = await geocode(value);

  return {
    source: "geocoded",
    label: resolved.label,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  };
}


// ======================================================
// get_current_location
// ======================================================

export const getCurrentLocationTool = {
  declaration: {
    name: "get_current_location",
    description:
      "Retourne la position actuelle approximative de l'utilisateur (déterminée par adresse IP) : coordonnées (latitude, longitude), ville, région, pays et libellé humain via géocodage inverse.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  async execute() {
    const current = await fetchCurrentLocation();

    const label = await reverseGeocode(
      current.latitude,
      current.longitude
    );

    return {
      latitude: current.latitude,
      longitude: current.longitude,
      city: current.city,
      region: current.region,
      country: current.country,
      label,
      source: "ip",
      note:
        "Position approximative (basée sur l'adresse IP), pas un GPS.",
    };
  },
};


// ======================================================
// place_add
// ======================================================

export const placeAddTool = {
  declaration: {
    name: "place_add",
    description:
      "Enregistre ou met à jour un lieu personnel avec un nom ('maison', 'travail', 'gymnase'...). Fournir une adresse OU des coordonnées : l'adresse est géocodée automatiquement.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description:
            "Nom du lieu (ex: 'maison', 'travail', 'gymnase').",
        },
        address: {
          type: Type.STRING,
          description:
            "Adresse ou description du lieu à géocoder (ex: '12 rue de Rivoli, Paris').",
        },
        latitude: {
          type: Type.NUMBER,
          description:
            "Latitude du lieu (alternative à address).",
        },
        longitude: {
          type: Type.NUMBER,
          description:
            "Longitude du lieu (alternative à address).",
        },
      },
      required: ["name"],
    },
  },

  async execute({ name, address, latitude, longitude }) {
    let lat = Number(latitude);
    let lng = Number(longitude);
    let label = null;

    const hasCoords =
      Number.isFinite(lat) &&
      Number.isFinite(lng);

    if (!hasCoords) {
      if (!address?.trim()) {
        throw new Error(
          "Fournis une address OU des latitude/longitude."
        );
      }

      const resolved = await geocode(address);
      lat = resolved.latitude;
      lng = resolved.longitude;
      label = resolved.label;
    } else {
      label = await reverseGeocode(lat, lng);
    }

    const place = savePlace({
      name,
      label,
      latitude: lat,
      longitude: lng,
      address: address?.trim() ?? null,
    });

    return {
      saved: true,
      name: place.name,
      label: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      updated: "updatedAt" in place &&
        place.createdAt !== place.updatedAt,
    };
  },
};


// ======================================================
// place_list
// ======================================================

export const placeListTool = {
  declaration: {
    name: "place_list",
    description:
      "Liste les lieux personnels enregistrés (maison, travail...) avec leurs coordonnées et libellés.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  execute: async () => {
    const places = listPlaces();

    return {
      count: places.length,
      places: places.map((place) => ({
        name: place.name,
        label: place.label,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
      })),
    };
  },
};


// ======================================================
// place_get
// ======================================================

export const placeGetTool = {
  declaration: {
    name: "place_get",
    description:
      "Retourne un lieu personnel enregistré par son nom (ex: 'maison').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description:
            "Nom du lieu à retrouver.",
        },
      },
      required: ["name"],
    },
  },

  execute: async ({ name }) => {
    const place = getPlace(name);

    if (!place) {
      throw new Error(
        `Aucun lieu enregistré nommé « ${name} ». Utilise place_list pour voir les lieux existants.`
      );
    }

    return {
      name: place.name,
      label: place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
    };
  },
};


// ======================================================
// place_remove
// ======================================================

export const placeRemoveTool = {
  declaration: {
    name: "place_remove",
    description:
      "Supprime un lieu personnel enregistré par son nom.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description:
            "Nom du lieu à supprimer.",
        },
      },
      required: ["name"],
    },
  },

  execute: async ({ name }) => {
    if (!removePlace(name)) {
      throw new Error(
        `Aucun lieu enregistré nommé « ${name} ».`
      );
    }

    return { removed: true, name };
  },
};


// ======================================================
// place_distance
// ======================================================

export const placeDistanceTool = {
  declaration: {
    name: "place_distance",
    description:
      "Calcule la distance et le temps de trajet en voiture entre deux lieux. Chaque lieu peut être : un lieu personnel enregistré ('maison', 'travail'...), 'current' / 'ma position' (position actuelle), ou une adresse libre ('12 rue de Rivoli, Paris').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        from: {
          type: Type.STRING,
          description:
            "Lieu de départ (lieu enregistré, 'current', ou adresse).",
        },
        to: {
          type: Type.STRING,
          description:
            "Lieu d'arrivée (lieu enregistré, 'current', ou adresse).",
        },
      },
      required: ["from", "to"],
    },
  },

  async execute({ from, to }) {
    const origin = await resolveLocation(from);
    const destination = await resolveLocation(to);

    const straightKm = haversineKm(origin, destination);

    let driving = null;
    let mode = "driving";

    try {
      driving = await drivingBetween(origin, destination);
    } catch {
      mode = "straight";
    }

    const result = {
      from: {
        source: origin.source,
        label: origin.label,
      },
      to: {
        source: destination.source,
        label: destination.label,
      },
      distanceKm: mode === "driving"
        ? (driving.distanceMeters ?? 0) / 1000
        : straightKm,
      straightLineKm: straightKm,
      duration: mode === "driving"
        ? formatDuration(driving.durationSeconds)
        : null,
      mode,
    };

    result.distance =
      formatDistanceKm(result.distanceKm);

    if (mode === "driving") {
      result.durationMinutes =
        driving.durationSeconds
          ? Math.round(driving.durationSeconds / 60)
          : null;
    }

    return result;
  },
};


// ======================================================
// EXPORT
// ======================================================

export const locationTools = [
  getCurrentLocationTool,
  placeAddTool,
  placeListTool,
  placeGetTool,
  placeRemoveTool,
  placeDistanceTool,
];