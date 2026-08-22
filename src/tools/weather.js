import { Type } from "@google/genai";


// ======================================================
// OUTIL OPEN-METEO COMPLET
// ======================================================

export const weatherTool = {

  declaration: {

    name: "get_weather_data",

    description: `
Récupère des données météorologiques et environnementales
via Open-Meteo.

Modes disponibles :

- current :
  météo actuelle

- forecast :
  prévisions météo

- air_quality :
  qualité de l'air, pollution, UV et pollen

- elevation :
  altitude d'un lieu

- flood :
  débit des rivières et données de crue

- marine :
  météo marine et état de la mer

- historical :
  météo historique

- historical_forecast :
  anciennes prévisions météo archivées

- ensemble :
  prévisions issues de modèles d'ensemble

- seasonal :
  prévisions saisonnières

- climate :
  données climatiques

Utiliser le mode correspondant exactement
à la demande de l'utilisateur.
`,

    parameters: {

      type: Type.OBJECT,

      properties: {

        mode: {
          type: Type.STRING,

          enum: [
            "current",
            "forecast",
            "air_quality",
            "elevation",
            "flood",
            "marine",
            "historical",
            "historical_forecast",
            "ensemble",
            "seasonal",
            "climate",
          ],

          description:
            "Type de données Open-Meteo à récupérer.",
        },


        city: {
          type: Type.STRING,

          description:
            "Ville ou lieu, par exemple Paris, Marseille, Tokyo.",
        },


        startDate: {
          type: Type.STRING,

          description:
            "Date de début YYYY-MM-DD pour les données historiques.",
        },


        endDate: {
          type: Type.STRING,

          description:
            "Date de fin YYYY-MM-DD pour les données historiques.",
        },


        forecastDays: {
          type: Type.INTEGER,

          description:
            "Nombre de jours de prévision souhaités.",
        },
      },

      required: [
        "mode",
        "city",
      ],
    },
  },


  // ====================================================
  // EXÉCUTION
  // ====================================================

  execute: async ({
    mode,
    city,
    startDate,
    endDate,
    forecastDays = 7,
  }) => {

    if (!city?.trim()) {
      throw new Error(
        "Ville manquante."
      );
    }


    // ==================================================
    // 1. GÉOCODAGE
    // ==================================================

    const location =
      await geocodeCity(
        city
      );


    const {
      latitude,
      longitude,
      name,
      country,
      timezone,
    } = location;


    console.log(
      `[Open-Meteo : ${mode} / ${name}, ${country}]`
    );


    // ==================================================
    // 2. CHOIX DE L'API
    // ==================================================

    switch (mode) {


      // ================================================
      // MÉTÉO ACTUELLE
      // ================================================

      case "current":

        return await getCurrentWeather({
          latitude,
          longitude,
          name,
          country,
          timezone,
        });


      // ================================================
      // PRÉVISIONS
      // ================================================

      case "forecast":

        return await getForecast({
          latitude,
          longitude,
          name,
          country,
          timezone,
          forecastDays,
        });


      // ================================================
      // QUALITÉ DE L'AIR
      // ================================================

      case "air_quality":

        return await getAirQuality({
          latitude,
          longitude,
          name,
          country,
          timezone,
        });


      // ================================================
      // ALTITUDE
      // ================================================

      case "elevation":

        return await getElevation({
          latitude,
          longitude,
          name,
          country,
        });


      // ================================================
      // CRUES / DÉBIT DES RIVIÈRES
      // ================================================

      case "flood":

        return await getFlood({
          latitude,
          longitude,
          name,
          country,
        });


      // ================================================
      // MARINE
      // ================================================

      case "marine":

        return await getMarine({
          latitude,
          longitude,
          name,
          country,
          timezone,
          forecastDays,
        });


      // ================================================
      // HISTORIQUE
      // ================================================

      case "historical":

        if (!startDate || !endDate) {

          throw new Error(
            "startDate et endDate sont nécessaires pour historical."
          );
        }

        return await getHistorical({
          latitude,
          longitude,
          name,
          country,
          timezone,
          startDate,
          endDate,
        });


      // ================================================
      // ANCIENNES PRÉVISIONS
      // ================================================

      case "historical_forecast":

        if (!startDate || !endDate) {

          throw new Error(
            "startDate et endDate sont nécessaires pour historical_forecast."
          );
        }

        return await getHistoricalForecast({
          latitude,
          longitude,
          name,
          country,
          timezone,
          startDate,
          endDate,
        });


      // ================================================
      // ENSEMBLES
      // ================================================

      case "ensemble":

        return await getEnsemble({
          latitude,
          longitude,
          name,
          country,
          timezone,
          forecastDays,
        });


      // ================================================
      // SAISONNIER
      // ================================================

      case "seasonal":

        return await getSeasonal({
          latitude,
          longitude,
          name,
          country,
          timezone,
        });


      // ================================================
      // CLIMAT
      // ================================================

      case "climate":

        if (!startDate || !endDate) {

          throw new Error(
            "startDate et endDate sont nécessaires pour climate."
          );
        }

        return await getClimate({
          latitude,
          longitude,
          name,
          country,
          startDate,
          endDate,
        });


      default:

        throw new Error(
          `Mode Open-Meteo inconnu : ${mode}`
        );
    }
  },
};


// ======================================================
// FETCH JSON
// ======================================================

async function fetchJson(
  url
) {

  const response =
    await fetch(url);


  if (!response.ok) {

    throw new Error(
      `Open-Meteo HTTP ${response.status}`
    );
  }


  return await response.json();
}


// ======================================================
// GÉOCODAGE
// ======================================================

async function geocodeCity(
  city
) {

  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(city)}` +
    `&count=1` +
    `&language=fr` +
    `&format=json`;


  const data =
    await fetchJson(url);


  const place =
    data.results?.[0];


  if (!place) {

    throw new Error(
      `Lieu introuvable : ${city}`
    );
  }


  return place;
}


// ======================================================
// MÉTÉO ACTUELLE
// ======================================================

async function getCurrentWeather({
  latitude,
  longitude,
  name,
  country,
  timezone,
}) {

  const current = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ].join(",");


  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=${current}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "current_weather",

    location: {
      name,
      country,
      latitude,
      longitude,
      timezone,
    },

    current:
      data.current,

    units:
      data.current_units,
  };
}


// ======================================================
// PRÉVISIONS
// ======================================================

async function getForecast({
  latitude,
  longitude,
  name,
  country,
  timezone,
  forecastDays,
}) {

  const hourly = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "visibility",
    "wind_speed_10m",
    "wind_gusts_10m",
  ].join(",");


  const daily = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "sunrise",
    "sunset",
    "precipitation_sum",
    "rain_sum",
    "snowfall_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
  ].join(",");


  const days =
    Math.min(
      Math.max(
        forecastDays,
        1
      ),
      16
    );


  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&hourly=${hourly}` +
    `&daily=${daily}` +
    `&forecast_days=${days}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "weather_forecast",

    location: {
      name,
      country,
      latitude,
      longitude,
      timezone,
    },

    daily:
      data.daily,

    hourly:
      data.hourly,
  };
}


// ======================================================
// QUALITÉ DE L'AIR
// ======================================================

async function getAirQuality({
  latitude,
  longitude,
  name,
  country,
}) {

  const current = [
    "european_aqi",
    "us_aqi",
    "pm10",
    "pm2_5",
    "carbon_monoxide",
    "nitrogen_dioxide",
    "sulphur_dioxide",
    "ozone",
    "uv_index",
    "dust",
    "alder_pollen",
    "birch_pollen",
    "grass_pollen",
    "mugwort_pollen",
    "olive_pollen",
    "ragweed_pollen",
  ].join(",");


  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=${current}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "air_quality",

    location: {
      name,
      country,
      latitude,
      longitude,
    },

    current:
      data.current,

    units:
      data.current_units,
  };
}


// ======================================================
// ALTITUDE
// ======================================================

async function getElevation({
  latitude,
  longitude,
  name,
  country,
}) {

  const url =
    `https://api.open-meteo.com/v1/elevation` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}`;


  const data =
    await fetchJson(url);


  return {

    type:
      "elevation",

    location: {
      name,
      country,
      latitude,
      longitude,
    },

    elevation:
      data.elevation?.[0],
  };
}


// ======================================================
// CRUES
// ======================================================

async function getFlood({
  latitude,
  longitude,
  name,
  country,
}) {

  const url =
    `https://flood-api.open-meteo.com/v1/flood` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&daily=river_discharge,river_discharge_mean,river_discharge_max`;


  const data =
    await fetchJson(url);


  return {

    type:
      "flood",

    location: {
      name,
      country,
      latitude,
      longitude,
    },

    daily:
      data.daily,
  };
}


// ======================================================
// MARINE
// ======================================================

async function getMarine({
  latitude,
  longitude,
  name,
  country,
  forecastDays,
}) {

  const hourly = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "wind_wave_height",
    "wind_wave_direction",
    "wind_wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "sea_surface_temperature",
  ].join(",");


  const days =
    Math.min(
      Math.max(
        forecastDays,
        1
      ),
      7
    );


  const url =
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&hourly=${hourly}` +
    `&forecast_days=${days}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "marine",

    location: {
      name,
      country,
      latitude,
      longitude,
    },

    hourly:
      data.hourly,
  };
}


// ======================================================
// HISTORIQUE
// ======================================================

async function getHistorical({
  latitude,
  longitude,
  name,
  country,
  startDate,
  endDate,
}) {

  const daily = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "precipitation_sum",
    "rain_sum",
    "snowfall_sum",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
  ].join(",");


  const url =
    `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&daily=${daily}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "historical_weather",

    location: {
      name,
      country,
      latitude,
      longitude,
    },

    daily:
      data.daily,
  };
}


// ======================================================
// HISTORICAL FORECAST
// ======================================================

async function getHistoricalForecast({
  latitude,
  longitude,
  name,
  country,
  startDate,
  endDate,
}) {

  const hourly = [
    "temperature_2m",
    "relative_humidity_2m",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
  ].join(",");


  const url =
    `https://historical-forecast-api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&hourly=${hourly}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "historical_forecast",

    location: {
      name,
      country,
    },

    hourly:
      data.hourly,
  };
}


// ======================================================
// ENSEMBLE
// ======================================================

async function getEnsemble({
  latitude,
  longitude,
  name,
  country,
  forecastDays,
}) {

  const hourly = [
    "temperature_2m",
    "precipitation",
    "wind_speed_10m",
  ].join(",");


  const days =
    Math.min(
      Math.max(
        forecastDays,
        1
      ),
      16
    );


  const url =
    `https://ensemble-api.open-meteo.com/v1/ensemble` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&hourly=${hourly}` +
    `&forecast_days=${days}` +
    `&timezone=auto`;


  const data =
    await fetchJson(url);


  return {

    type:
      "ensemble",

    location: {
      name,
      country,
    },

    hourly:
      data.hourly,
  };
}


// ======================================================
// SAISONNIER
// ======================================================

async function getSeasonal({
  latitude,
  longitude,
  name,
  country,
}) {

  const monthly = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
  ].join(",");


  const url =
    `https://seasonal-api.open-meteo.com/v1/seasonal` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&monthly=${monthly}`;


  const data =
    await fetchJson(url);


  return {

    type:
      "seasonal",

    location: {
      name,
      country,
    },

    monthly:
      data.monthly,
  };
}


// ======================================================
// CLIMAT
// ======================================================

async function getClimate({
  latitude,
  longitude,
  name,
  country,
  startDate,
  endDate,
}) {

  const daily = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
  ].join(",");


  const url =
    `https://climate-api.open-meteo.com/v1/climate` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&start_date=${startDate}` +
    `&end_date=${endDate}` +
    `&daily=${daily}`;


  const data =
    await fetchJson(url);


  return {

    type:
      "climate",

    location: {
      name,
      country,
    },

    daily:
      data.daily,
  };
}