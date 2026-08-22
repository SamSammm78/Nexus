import "dotenv/config";

const API_KEY = process.env.IDFM_API_KEY;


// ======================================================
// OUTILS DE FORMATAGE
// ======================================================

function formatTime(dateTime) {
  if (!dateTime) return null;

  const hour = dateTime.substring(9, 11);
  const minute = dateTime.substring(11, 13);

  return `${hour}:${minute}`;
}

function formatDuration(seconds) {
  if (seconds == null) return null;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours} h ${minutes} min`;
  }

  return `${minutes} min`;
}

function getPlaceName(place) {
  if (!place) return "Lieu inconnu";

  return (
    place.name ||
    place.stop_area?.name ||
    place.stop_point?.name ||
    "Lieu inconnu"
  );
}


// ======================================================
// SIMPLIFICATION D'UNE SECTION
// ======================================================

function simplifySection(section) {
  const base = {
    type: section.type,

    depart: getPlaceName(section.from),

    arrivee: getPlaceName(section.to),

    heureDepart:
      formatTime(section.departure_date_time),

    heureArrivee:
      formatTime(section.arrival_date_time),

    dureeSecondes:
      section.duration ?? 0,

    duree:
      formatDuration(section.duration ?? 0),
  };


  // --------------------------------------------------
  // TRANSPORT PUBLIC
  // --------------------------------------------------

  if (section.type === "public_transport") {
    const info =
      section.display_informations ?? {};

    return {
      ...base,

      mode:
        info.commercial_mode ||
        info.physical_mode ||
        "Transport",

      ligne:
        info.code ||
        info.name ||
        null,

      direction:
        info.direction ||
        null,

      reseau:
        info.network ||
        null,

      couleur:
        info.color ||
        null,

      terminus:
        info.headsign ||
        null,

      geojson:
        section.geojson ?? null,
    };
  }


  // --------------------------------------------------
  // MARCHE / TRANSFERT
  // --------------------------------------------------

  if (
    section.type === "street_network" ||
    section.type === "crow_fly" ||
    section.type === "transfer"
  ) {
    return {
      ...base,

      mode:
        section.mode ||
        "walking",

      geojson:
        section.geojson ?? null,
    };
  }


  // --------------------------------------------------
  // AUTRES TYPES
  // --------------------------------------------------

  return {
    ...base,

    mode:
      section.mode ||
      section.type ||
      "inconnu",

    geojson:
      section.geojson ?? null,
  };
}


// ======================================================
// SIMPLIFICATION DU TRAJET COMPLET
// ======================================================

function simplifyJourney(data) {
  if (!data.journeys?.length) {
    throw new Error(
      "Aucun itinéraire trouvé."
    );
  }


  const journey =
    data.journeys.find(
      journey =>
        journey.type === "best"
    ) ??
    data.journeys[0];


  const sections =
    journey.sections ?? [];


  const simplifiedSections =
    sections.map(
      simplifySection
    );


  return {
    type:
      journey.type ?? null,

    depart:
      getPlaceName(
        sections[0]?.from
      ),

    arrivee:
      getPlaceName(
        sections[
          sections.length - 1
        ]?.to
      ),

    heureDepart:
      formatTime(
        journey.departure_date_time
      ),

    heureArrivee:
      formatTime(
        journey.arrival_date_time
      ),

    dureeSecondes:
      journey.duration,

    duree:
      formatDuration(
        journey.duration
      ),

    correspondances:
      journey.nb_transfers ?? 0,

    nombreEtapes:
      simplifiedSections.length,

    etapes:
      simplifiedSections,
  };
}


// ======================================================
// APPEL API IDFM
// ======================================================

async function getJourney(
  from,
  to
) {
  const url =
    "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys" +
    `?from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}`;


  const response =
    await fetch(
      url,
      {
        headers: {
          apikey: API_KEY,
        },
      }
    );


  if (!response.ok) {
    throw new Error(
      `Erreur IDFM ${response.status}: ${await response.text()}`
    );
  }


  // JSON brut temporaire en RAM
  const rawData =
    await response.json();


  // On ne retourne QUE
  // la version simplifiée
  return simplifyJourney(
    rawData
  );
}


// ======================================================
// AFFICHAGE PROPRE DANS LE TERMINAL
// ======================================================

function displayJourney(journey) {

  console.log(
    "\n=============================="
  );

  console.log(
    "         ITINÉRAIRE"
  );

  console.log(
    "==============================\n"
  );


  console.log(
    `${journey.depart}`
  );

  console.log("↓");

  console.log(
    `${journey.arrivee}\n`
  );


  console.log(
    `Départ : ${journey.heureDepart}`
  );

  console.log(
    `Arrivée : ${journey.heureArrivee}`
  );

  console.log(
    `Durée : ${journey.duree}`
  );

  console.log(
    `Correspondances : ${journey.correspondances}`
  );


  console.log(
    "\n------------------------------"
  );

  console.log(
    "ÉTAPES"
  );

  console.log(
    "------------------------------\n"
  );


  journey.etapes.forEach(
    (step, index) => {

      console.log(
        `${index + 1}. ${step.mode}`
      );


      if (step.ligne) {
        console.log(
          `   Ligne : ${step.ligne}`
        );
      }


      if (step.direction) {
        console.log(
          `   Direction : ${step.direction}`
        );
      }


      console.log(
        `   ${step.depart}`
      );

      console.log(
        `   ↓`
      );

      console.log(
        `   ${step.arrivee}`
      );


      console.log(
        `   ${step.heureDepart} → ${step.heureArrivee}`
      );

      console.log(
        `   ${step.duree}`
      );


      console.log("");
    }
  );
}


// ======================================================
// TEST
// ======================================================

try {

  const FROM =
    "stop_area:IDFM:66336";

  const TO =
    "stop_area:IDFM:71517";


  const journey =
    await getJourney(
      FROM,
      TO
    );


  // Objet JavaScript simplifié
  console.log(
    "\nJSON simplifié :\n"
  );



  // Affichage humain
  displayJourney(
    journey
  );

}

catch (error) {

  console.error(
    "\nErreur :",
    error.message
  );
}