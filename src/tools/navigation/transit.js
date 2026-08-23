import { Type } from "@google/genai";

import {
  sendTransitRouteToMap
} from "../../services/mapRoute.js";

function buildIDFMDateTime(
  date,
  time
) {

  const now =
    new Date();


  // ==========================================
  // AUCUNE DATE / HEURE
  // → maintenant
  // ==========================================

  if (!date && !time) {
    return getCurrentDateTimeIDFM();
  }


  let target =
    new Date(now);


  // ==========================================
  // DATE
  // ==========================================

  if (
    date === "tomorrow"
  ) {

    target.setDate(
      target.getDate() + 1
    );

  }

  else if (
    date === "today" ||
    !date
  ) {

    // Aujourd'hui :
    // rien à modifier.

  }

  else {

    // Format YYYY-MM-DD

    const match =
      /^(\d{4})-(\d{2})-(\d{2})$/
        .exec(date);


    if (!match) {

      throw new Error(
        `Format de date invalide : ${date}`
      );
    }


    target.setFullYear(
      Number(match[1])
    );

    target.setMonth(
      Number(match[2]) - 1
    );

    target.setDate(
      Number(match[3])
    );
  }


  // ==========================================
  // HEURE
  // ==========================================

  if (time) {

    const match =
      /^(\d{1,2}):(\d{2})$/
        .exec(time);


    if (!match) {

      throw new Error(
        `Format d'heure invalide : ${time}`
      );
    }


    const hours =
      Number(match[1]);

    const minutes =
      Number(match[2]);


    if (
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {

      throw new Error(
        `Heure invalide : ${time}`
      );
    }


    target.setHours(
      hours,
      minutes,
      0,
      0
    );

  }

  else {

    // Une date a été précisée
    // mais pas d'heure :
    // on garde l'heure actuelle.

    target.setSeconds(
      0,
      0
    );
  }


  // ==========================================
  // FORMAT NAVITIA
  // ==========================================

  const year =
    target.getFullYear();

  const month =
    String(
      target.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      target.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      target.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      target.getMinutes()
    ).padStart(2, "0");

  const seconds =
    String(
      target.getSeconds()
    ).padStart(2, "0");


  return (
    `${year}${month}${day}` +
    `T${hours}${minutes}${seconds}`
  );
}

//RECUPERER L'HEURE ACTUELLE
function getCurrentDateTimeIDFM() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      now.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      now.getMinutes()
    ).padStart(2, "0");

  const seconds =
    String(
      now.getSeconds()
    ).padStart(2, "0");

  return (
    `${year}${month}${day}` +
    `T${hours}${minutes}${seconds}`
  );
}


const IDFM_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";


// ======================================================
// APPEL API IDFM
// ======================================================

async function idfmFetch(path) {

  const response = await fetch(
    `${IDFM_BASE}${path}`,
    {
      headers: {
        apiKey:
          process.env.IDFM_API_KEY,
      },
    }
  );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `IDFM HTTP ${response.status} : ${text}`
    );
  }


  return await response.json();
}


// ======================================================
// RECHERCHE D'UN LIEU
// ======================================================

async function findPlace(
  query
) {

  const data =
    await idfmFetch(
      `/places?q=${encodeURIComponent(query)}&count=1`
    );


  const place =
    data.places?.[0];


  if (!place) {

    throw new Error(
      `Lieu IDFM introuvable : ${query}`
    );
  }


  return {
    id:
      place.id,

    name:
      place.name,

    type:
      place.embedded_type,
  };
}


// ======================================================
// FORMAT HEURE NAVITIA
// ======================================================

function formatTime(
  value
) {

  if (!value) {
    return null;
  }


  // Exemple :
  // 20260816T225500
  // devient :
  // 22:55

  return (
    value.slice(9, 11) +
    ":" +
    value.slice(11, 13)
  );
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
// SIMPLIFICATION D'UNE SECTION
// ======================================================

function simplifySection(section) {

  const result = {
    type:
      section.type,

    from:
      section.from?.name ?? null,

    to:
      section.to?.name ?? null,

    duration:
      formatDuration(
        section.duration
      ),

    departure:
      formatTime(
        section.departure_date_time
      ),

    arrival:
      formatTime(
        section.arrival_date_time
      ),

    geometry:
      section.geojson ?? null,
  };


  if (
    section.type ===
    "public_transport"
  ) {

    result.transport = {
      mode:
        section.display_informations
          ?.physical_mode ??
        null,

      line:
        section.display_informations
          ?.label ??
        section.display_informations
          ?.code ??
        null,

      direction:
        section.display_informations
          ?.direction ??
        null,

      headsign:
        section.display_informations
          ?.headsign ??
        null,

      color:
        section.display_informations
          ?.color ??
        null,

      lineId:
        section.links
          ?.find(
            link =>
              link.type === "line"
          )
          ?.id ??
        null,
    };
  }


  return result;
}


// ======================================================
// SIMPLIFICATION DU TRAJET
// ======================================================

function simplifyJourney(journey) {

  const sections =
    (journey.sections ?? [])
      .map(
        simplifySection
      );


  const lines =
    sections
      .filter(
        section =>
          section.type ===
            "public_transport" &&
          section.transport
      )
      .map(
        section => ({
          id:
            section.transport.lineId,

          name:
            section.transport.line,

          mode:
            section.transport.mode,

          direction:
            section.transport.direction,
        })
      );


  const uniqueLines =
    lines.filter(
      (
        line,
        index,
        array
      ) => {

        if (line.id) {
          return (
            array.findIndex(
              other =>
                other.id ===
                line.id
            ) === index
          );
        }

        return (
          array.findIndex(
            other =>
              other.name ===
                line.name &&
              other.mode ===
                line.mode
          ) === index
        );
      }
    );


  return {
    duration:
      formatDuration(
        journey.duration
      ),

    durationSeconds:
      journey.duration,

    departure:
      formatTime(
        journey.departure_date_time
      ),

    arrival:
      formatTime(
        journey.arrival_date_time
      ),

    transfers:
      journey.nb_transfers ?? 0,

    lines:
      uniqueLines,

    sections,
  };
}


// ======================================================
// OUTIL NEXUS
// ======================================================

export const transitTool = {

  declaration: {

    name:
      "get_transit_journey",

 description: `
Calcule un trajet en transports en commun
en Île-de-France avec Île-de-France Mobilités.

Utiliser pour :
- métro
- RER
- train
- tram
- bus
- transports publics
- correspondances
- heure de départ
- heure d'arrivée souhaitée

IMPORTANT :

Si l'utilisateur dit :
"je pars à 7h30"
→ datetimeRepresents = "departure"

Si l'utilisateur dit :
"je veux arriver à 9h"
→ datetimeRepresents = "arrival"

Si aucune heure n'est indiquée :
ne pas fournir datetime.
L'outil utilisera automatiquement
l'heure actuelle.

IMPORTANT :

Ne jamais calculer ou inventer une date absolue
si l'utilisateur dit aujourd'hui ou demain.

Utiliser :

"aujourd'hui"
→ date = "today"

"demain"
→ date = "tomorrow"

"demain à 9h"
→ date = "tomorrow"
→ time = "09:00"

"je veux arriver demain à 9h"
→ datetimeRepresents = "arrival"

"je pars demain à 7h30"
→ datetimeRepresents = "departure"

Ne jamais fournir une date provenant de ta mémoire
de la date actuelle.
JavaScript calculera la date réelle.
`,

    parameters: {

      type:
        Type.OBJECT,

      properties: {

        from: {

          type:
            Type.STRING,

          description:
            "Lieu de départ, gare, station, ville ou adresse.",
        },


        to: {

          type:
            Type.STRING,

          description:
            "Destination, gare, station, ville ou adresse.",
        },


        date: {
        type: Type.STRING,

        description: `
      Date du trajet.

      Valeurs recommandées :
      - "today"
      - "tomorrow"
      - "YYYY-MM-DD"

      Si l'utilisateur ne précise aucune date,
      ne pas fournir ce paramètre.
      `,
      },

      time: {
        type: Type.STRING,

        description: `
      Heure souhaitée au format HH:MM.

      Exemples :
      "07:30"
      "09:00"

      Si aucune heure n'est précisée,
      ne pas fournir ce paramètre.
      `,
      },

      datetimeRepresents: {
        type: Type.STRING,

        enum: [
          "departure",
          "arrival",
        ],

        description: `
      Indique ce que représente l'heure :

      - departure : heure de départ
      - arrival : heure d'arrivée souhaitée

      Si l'utilisateur dit
      "je pars à 8h" :
      departure

      Si l'utilisateur dit
      "je veux arriver à 9h" :
      arrival
      `,
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
  date,
  time,
  datetimeRepresents = "departure",
}) => {



    // ==================================================
    // TROUVER LES LIEUX
    // ==================================================

    const origin =
      await findPlace(
        from
      );


    const destination =
      await findPlace(
        to
      );

    // ==================================================
    // PARAMÈTRES DU TRAJET
    // ==================================================

    const params =
      new URLSearchParams({

        from:
          origin.id,

        to:
          destination.id,

        count:
          "3",

      });


    const finalDateTime =
  buildIDFMDateTime(
    date,
    time
  );

    params.set(
      "datetime",
      finalDateTime
    );

    params.set(
      "datetime_represents",
      datetimeRepresents
    );

    // ==================================================
    // APPEL JOURNEYS
    // ==================================================

    const data =
      await idfmFetch(
        `/journeys?${params.toString()}`
      );


    const journeys =
      (data.journeys ?? [])
        .slice(0, 3)
        .map(
          simplifyJourney
        );


    if (
      !journeys.length
    ) {

      throw new Error(
        "Aucun trajet IDFM trouvé."
      );
    }


    // ==========================================
    // MAP
    // ==========================================

    await sendTransitRouteToMap(
      journeys[0],
      origin,
      destination
    );


    // ==========================================
    // VERSION LÉGÈRE POUR GEMINI
    // ==========================================

    const journeysForLLM =
      journeys.map(
        journey => ({

          duration:
            journey.duration,

          durationSeconds:
            journey.durationSeconds,

          departure:
            journey.departure,

          arrival:
            journey.arrival,

          transfers:
            journey.transfers,

          lines:
            journey.lines,

          sections:
            (journey.sections ?? [])
              .map(
                section => ({

                  type:
                    section.type,

                  from:
                    section.from,

                  to:
                    section.to,

                  departure:
                    section.departure,

                  arrival:
                    section.arrival,

                  duration:
                    section.duration,

                  transport:
                    section.transport
                    ?? null,

                  // PAS DE GEOMETRY

                })
              ),

        })
      );


    // ==========================================
    // TOOL RESPONSE
    // ==========================================

    return {

      mode:
        "public_transport",

      origin:
        origin?.name ??
        origin,

      destination:
        destination?.name ??
        destination,

      journeys:
        journeysForLLM,

    };
  },
};