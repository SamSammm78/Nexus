import {
  getUpcomingEvents,
  searchCalendarEvents,
  getEventsBetween,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "../../services/google/calendar.js";

export const calendarTools = [
  {
    declaration: {
      name:
        "get_upcoming_events",

      description:
        "Récupère les prochains événements du calendrier Google principal de l'utilisateur.",

      parameters: {
        type: "object",

        properties: {
          maxResults: {
            type: "number",

            description:
              "Nombre maximum d'événements à retourner.",
          },
        },
      },
    },

    async execute(args) {
      return getUpcomingEvents(
        args
      );
    },
  },

  {
    declaration: {
      name:
        "search_calendar_events",

      description:
        "Recherche des événements Google Calendar à partir de mots-clés.",

      parameters: {
        type: "object",

        properties: {
          query: {
            type: "string",

            description:
              "Texte à rechercher dans les événements.",
          },

          maxResults: {
            type: "number",

            description:
              "Nombre maximum de résultats.",
          },

          timeMin: {
            type: "string",

            description:
              "Date minimale au format ISO 8601.",
          },

          timeMax: {
            type: "string",

            description:
              "Date maximale au format ISO 8601.",
          },
        },

        required: [
          "query",
        ],
      },
    },

    async execute(args) {
      return searchCalendarEvents(
        args
      );
    },
  },

  {
    declaration: {
      name:
        "get_calendar_events_between",

      description:
        "Récupère les événements du calendrier compris entre deux dates.",

      parameters: {
        type: "object",

        properties: {
          start: {
            type: "string",

            description:
              "Début de la période au format ISO 8601.",
          },

          end: {
            type: "string",

            description:
              "Fin de la période au format ISO 8601.",
          },

          maxResults: {
            type: "number",
          },
        },

        required: [
          "start",
          "end",
        ],
      },
    },

    async execute(args) {
      return getEventsBetween(
        args
      );
    },
  },

  {
    declaration: {
      name:
        "create_calendar_event",

      description:
        "Crée un nouvel événement dans Google Calendar.",

      parameters: {
        type: "object",

        properties: {
          title: {
            type: "string",

            description:
              "Titre de l'événement.",
          },

          start: {
            type: "string",

            description:
              "Date et heure de début au format ISO 8601, par exemple 2026-08-28T14:00:00+02:00.",
          },

          end: {
            type: "string",

            description:
              "Date et heure de fin au format ISO 8601.",
          },

          description: {
            type: "string",
          },

          location: {
            type: "string",
          },

          timeZone: {
            type: "string",

            description:
              "Fuseau horaire, par défaut Europe/Paris.",
          },
        },

        required: [
          "title",
          "start",
          "end",
        ],
      },
    },

    async execute(args) {
      return createCalendarEvent(
        args
      );
    },
  },

  {
    declaration: {
      name:
        "update_calendar_event",

      description:
        "Modifie un événement Google Calendar existant.",

      parameters: {
        type: "object",

        properties: {
          eventId: {
            type: "string",
          },

          title: {
            type: "string",
          },

          start: {
            type: "string",
          },

          end: {
            type: "string",
          },

          description: {
            type: "string",
          },

          location: {
            type: "string",
          },

          timeZone: {
            type: "string",
          },
        },

        required: [
          "eventId",
        ],
      },
    },

    async execute(args) {
      return updateCalendarEvent(
        args
      );
    },
  },

  {
    declaration: {
      name:
        "delete_calendar_event",

      description:
        "Supprime un événement Google Calendar existant.",

      parameters: {
        type: "object",

        properties: {
          eventId: {
            type: "string",

            description:
              "Identifiant Google Calendar de l'événement à supprimer.",
          },
        },

        required: [
          "eventId",
        ],
      },
    },

    async execute(args) {
      return deleteCalendarEvent(
        args.eventId
      );
    },
  },
];