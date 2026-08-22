import fs from "node:fs/promises";
import path from "node:path";

const ROUTE_FILE =
  path.resolve(
    process.cwd(),
    "data/current-route.json"
  );

export async function sendRouteToMap(
  route
) {

  if (!route?.geometry) {
    throw new Error(
      "Impossible d'envoyer le trajet à la map : geometry absente."
    );
  }

  const mapData = {
    type: "driving",

    origin:
      route.origin?.name ??
      null,

    destination:
      route.destination?.name ??
      null,

    distance:
      route.distance ??
      null,

    duration:
      route.duration ??
      null,

    geometry:
      route.geometry,

    updatedAt:
      new Date().toISOString(),
  };

  await fs.mkdir(
    path.dirname(ROUTE_FILE),
    {
      recursive: true,
    }
  );

  await fs.writeFile(
    ROUTE_FILE,
    JSON.stringify(
      mapData,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `[MAP] Trajet envoyé : ${mapData.origin} → ${mapData.destination}`
  );

  return mapData;
}

export async function sendTransitRouteToMap(
  journey,
  origin,
  destination
) {

  const segments =
  (journey.sections ?? [])
    .filter(
      section =>
        section.geometry
    )
    .map(
      section => ({
        type:
          section.type,

        from:
          section.from,

        to:
          section.to,

        departure:
          section.departure ?? null,

        arrival:
          section.arrival ?? null,

        duration:
          section.duration ?? null,

        geometry:
          section.geometry,

        transport:
          section.transport ?? null,
      })
    );


  const mapData = {

    type:
      "transit",

    origin:
      origin?.name ??
      null,

    destination:
      destination?.name ??
      null,

    duration:
      journey.duration ??
      null,

    departure:
      journey.departure ??
      null,

    arrival:
      journey.arrival ??
      null,

    transfers:
      journey.transfers ??
      0,

    segments,

    updatedAt:
      new Date().toISOString(),
  };


  await fs.mkdir(
    path.dirname(ROUTE_FILE),
    {
      recursive: true,
    }
  );


  await fs.writeFile(
    ROUTE_FILE,
    JSON.stringify(
      mapData,
      null,
      2
    ),
    "utf8"
  );


  console.log(
    `[MAP] Trajet transport envoyé : ${mapData.origin} → ${mapData.destination}`
  );


  return mapData;
}