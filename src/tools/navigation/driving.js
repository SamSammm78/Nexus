import { Type } from "@google/genai";

import {
  sendRouteToMap
} from "../../services/mapRoute.js";

// ======================================================
// CONFIGURATION
// ======================================================

const ORS_BASE =
  "https://api.openrouteservice.org";


// ======================================================
// FETCH ORS
// ======================================================

async function orsFetch(
  path,
  options = {}
) {

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
      `OpenRouteService HTTP ${response.status} : ${text}`
    );
  }


  return await response.json();
}


// ======================================================
// GÉOCODAGE
// ======================================================

async function geocodePlace(
  query
) {

  const url =
    `${ORS_BASE}/geocode/search` +
    `?api_key=${process.env.ORS_API_KEY}` +
    `&text=${encodeURIComponent(query)}` +
    `&size=1`;


  const response =
    await fetch(url);


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `ORS Geocoding HTTP ${response.status} : ${text}`
    );
  }


  const data =
    await response.json();


  const feature =
    data.features?.[0];


  if (!feature) {

    throw new Error(
      `Lieu introuvable : ${query}`
    );
  }


  const [
    longitude,
    latitude,
  ] =
    feature.geometry.coordinates;


  return {

    name:
      feature.properties?.label ??
      query,

    longitude,
    latitude,
  };
}


// ======================================================
// FORMAT DURÉE
// ======================================================

function formatDuration(
  seconds
) {

  if (
    typeof seconds !== "number"
  ) {
    return null;
  }


  const hours =
    Math.floor(
      seconds / 3600
    );


  const minutes =
    Math.round(
      (seconds % 3600) / 60
    );


  if (hours > 0) {

    return `${hours} h ${minutes} min`;
  }


  return `${minutes} min`;
}


// ======================================================
// FORMAT DISTANCE
// ======================================================

function formatDistance(
  meters
) {

  if (
    typeof meters !== "number"
  ) {
    return null;
  }


  if (meters < 1000) {

    return `${Math.round(meters)} m`;
  }


  return `${(
    meters / 1000
  ).toFixed(1)} km`;
}


// ======================================================
// SIMPLIFICATION DES ÉTAPES
// ======================================================

function simplifySteps(
  segments = []
) {

  return segments
    .flatMap(
      segment =>
        segment.steps ?? []
    )
    .map(
      step => ({

        instruction:
          step.instruction ??
          null,

        name:
          step.name ??
          null,

        duration:
          formatDuration(
            step.duration
          ),

        distance:
          formatDistance(
            step.distance
          ),

        type:
          step.type ??
          null,

      })
    );
}


// ======================================================
// OUTIL NEXUS
// ======================================================

export const drivingTool = {

  declaration: {

    name:
      "get_driving_route",

    description: `
Calcule un itinéraire en voiture avec OpenRouteService.

Utiliser cet outil pour :
- trajet en voiture
- temps de trajet routier
- distance en voiture
- itinéraire routier
- instructions de conduite
- route entre deux lieux

Ne pas utiliser pour les transports en commun.
Pour métro, RER, bus, train ou tram,
utiliser get_transit_journey.
`,

    parameters: {

      type:
        Type.OBJECT,

      properties: {

        from: {

          type:
            Type.STRING,

          description:
            "Adresse, ville ou lieu de départ.",
        },


        to: {

          type:
            Type.STRING,

          description:
            "Adresse, ville ou destination.",
        },
      },


      required: [
        "from",
        "to",
      ],
    },
  },


  execute: async ({
    from,
    to,
  }) => {

    // ==================================================
    // 1. GÉOCODAGE
    // ==================================================

    const origin =
      await geocodePlace(
        from
      );


    const destination =
      await geocodePlace(
        to
      );

    // ==================================================
    // 2. CALCUL DU TRAJET
    // ==================================================

    const data =
      await orsFetch(
        "/v2/directions/driving-car/geojson",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              coordinates: [

                [
                  origin.longitude,
                  origin.latitude,
                ],

                [
                  destination.longitude,
                  destination.latitude,
                ],

              ],

              instructions:
                true,

              language:
                "fr",

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
      route.properties?.summary ??
      {};


    // ==================================================
    // 3. VERSION ALLÉGÉE POUR LE LLM
    // ==================================================

    const mapResult = {
      mode:
        "driving",

      origin,

      destination,

      duration:
        formatDuration(
          summary.duration
        ),

      durationSeconds:
        summary.duration,

      distance:
        formatDistance(
          summary.distance
        ),

      distanceMeters:
        summary.distance,

      steps:
        simplifySteps(
          route.properties?.segments
        ),

      geometry:
        route.geometry,
    };


    // ==========================================
    // MAP
    // ==========================================

    await sendRouteToMap(
      mapResult
    );


    // ==========================================
    // VERSION LÉGÈRE POUR GEMINI
    // ==========================================

    const llmResult = {

      mode:
        "driving",

      origin:
        origin?.name ??
        origin,

      destination:
        destination?.name ??
        destination,

      duration:
        mapResult.duration,

      durationSeconds:
        mapResult.durationSeconds,

      distance:
        mapResult.distance,

      distanceMeters:
        mapResult.distanceMeters,

      steps:
        mapResult.steps,

    };


    // ==========================================
    // TOOL RESPONSE
    // ==========================================

    return llmResult;
  },
};