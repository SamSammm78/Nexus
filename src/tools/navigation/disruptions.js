import { Type } from "@google/genai";


async function getLineReport(
  lineId
) {

  const encodedLineId =
    encodeURIComponent(
      lineId
    );


  const url =
    `https://prim.iledefrance-mobilites.fr/marketplace/v2/` +
    `navitia/line_reports/lines/${encodedLineId}/line_reports` +
    `?count=100`;


  const response =
    await fetch(
      url,
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
      `IDFM trafic HTTP ${response.status} : ${text}`
    );
  }


  return await response.json();
}



const IDFM_TRAFFIC_BASE =
  "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia";


async function idfmTrafficFetch(path) {

  const response =
    await fetch(
      `${IDFM_TRAFFIC_BASE}${path}`,
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
      `IDFM Trafic HTTP ${response.status} : ${text}`
    );
  }


  return await response.json();
}


// ======================================================
// NETTOYAGE DU TEXTE
// ======================================================

function cleanText(value) {

  if (!value) {
    return null;
  }

  return String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


// ======================================================
// SIMPLIFICATION D'UNE PERTURBATION
// ======================================================

function simplifyDisruption(
  disruption
) {

  const messages =
    (disruption.messages ?? [])
      .map(
        message =>
          cleanText(
            message.text
          )
      )
      .filter(Boolean);


  const periods =
    (disruption.application_periods ?? [])
      .map(
        period => ({
          begin:
            period.begin ?? null,

          end:
            period.end ?? null,
        })
      );


  const impactedObjects =
    (disruption.impacted_objects ?? [])
      .map(
        object => {

          const ptObject =
            object.pt_object ?? {};

          return {

            type:
              ptObject.embedded_type ??
              null,

            name:
              ptObject.name ??
              null,

            id:
              ptObject.id ??
              null,

          };
        }
      );


  return {

    id:
      disruption.id ??
      disruption.disruption_id ??
      null,

    title:
      cleanText(
        disruption.title
      ),

    cause:
      disruption.cause ??
      null,

    severity: {

      name:
        disruption.severity?.name ??
        null,

      effect:
        disruption.severity?.effect ??
        null,

      priority:
        disruption.severity?.priority ??
        null,

    },

    status:
      disruption.status ??
      null,

    updatedAt:
      disruption.updated_at ??
      null,

    messages,

    periods,

    impactedObjects,
  };
}


// ======================================================
// OUTIL NEXUS
// ======================================================

export const disruptionsTool = {

  declaration: {

    name:
      "get_transit_disruptions",

    description: `
Récupère les perturbations et informations trafic
sur le réseau de transports Île-de-France Mobilités.

Utiliser pour :
- trafic RER
- trafic métro
- trafic train
- trafic tram
- trafic bus
- incidents
- travaux
- interruptions
- retards
- lignes perturbées

Cet outil peut être utilisé seul ou après
get_transit_journey pour vérifier si un trajet
est affecté par une perturbation.
`,

    parameters: {

      type:
        Type.OBJECT,

      properties: {

        line: {
          type:
            Type.STRING,

          description: `
Nom ou numéro de ligne optionnel.

Exemples :
"RER A"
"RER C"
"Metro 1"
"13"
"T2"

Si aucune ligne précise n'est connue,
ne pas fournir ce paramètre.
`,
        },

        lineId: {
  type: Type.STRING,

  description: `
Identifiant exact IDFM de la ligne.

Exemple :
line:IDFM:C01110

À privilégier lorsqu'il est disponible,
notamment après get_transit_journey.
`,
},

      },

      required: [],
    },
  },


  execute: async ({
  line,
  lineId,
  }) => {

    console.log(
      `[IDFM trafic : ${lineId ?? line ?? "réseau"}]`
    );


    let data;


    // ==========================================
    // ID exact de ligne disponible
    // ==========================================

    if (lineId) {

      data =
        await getLineReport(
          lineId
        );

    }

    else {

      // Ancien fallback
      data =
        await idfmTrafficFetch(
          `/disruptions?count=100`
        );
    }


    let disruptions =
      (data.disruptions ?? [])
        .map(
          simplifyDisruption
        );


    // Fallback texte uniquement
    // si aucun lineId n'a été fourni.

    if (
      !lineId &&
      line?.trim()
    ) {

      const search =
        line
          .toLowerCase()
          .replace(/\s+/g, "");


      disruptions =
        disruptions.filter(
          disruption => {

            const text =
              JSON.stringify(
                disruption
              )
                .toLowerCase()
                .replace(/\s+/g, "");


            return text.includes(
              search
            );
          }
        );
    }


    return {

      line:
        line ?? null,

      lineId:
        lineId ?? null,

      count:
        disruptions.length,

      disruptions:
        disruptions.slice(
          0,
          20
        ),
    };
  }
};