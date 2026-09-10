import { google } from "googleapis";
import { getGoogleAuth } from "./auth.js";

async function getCalendarClient() {
  const auth = await getGoogleAuth();

  return google.calendar({
    version: "v3",
    auth,
  });
}

function formatEvent(event) {
  return {
    id: event.id,

    title:
      event.summary ??
      "Sans titre",

    description:
      event.description ??
      null,

    location:
      event.location ??
      null,

    start:
      event.start?.dateTime ??
      event.start?.date ??
      null,

    end:
      event.end?.dateTime ??
      event.end?.date ??
      null,

    status:
      event.status ??
      null,

    link:
      event.htmlLink ??
      null,
  };
}

export async function getUpcomingEvents({
  maxResults = 10,
} = {}) {
  const calendar =
    await getCalendarClient();

  const response =
    await calendar.events.list({
      calendarId: "primary",

      timeMin:
        new Date().toISOString(),

      maxResults,

      singleEvents: true,

      orderBy: "startTime",
    });

  return (
    response.data.items ?? []
  ).map(formatEvent);
}

export async function searchCalendarEvents({
  query,
  maxResults = 20,
  timeMin,
  timeMax,
} = {}) {
  if (!query) {
    throw new Error(
      "Le paramètre query est requis."
    );
  }

  const calendar =
    await getCalendarClient();

  const params = {
    calendarId: "primary",

    q: query,

    singleEvents: true,

    orderBy: "startTime",

    maxResults,
  };

  if (timeMin) {
    params.timeMin =
      new Date(
        timeMin
      ).toISOString();
  }

  if (timeMax) {
    params.timeMax =
      new Date(
        timeMax
      ).toISOString();
  }

  const response =
    await calendar.events.list(
      params
    );

  return (
    response.data.items ?? []
  ).map(formatEvent);
}

export async function getEventsBetween({
  start,
  end,
  maxResults = 50,
}) {
  if (!start || !end) {
    throw new Error(
      "start et end sont requis."
    );
  }

  const calendar =
    await getCalendarClient();

  const response =
    await calendar.events.list({
      calendarId: "primary",

      timeMin:
        new Date(
          start
        ).toISOString(),

      timeMax:
        new Date(
          end
        ).toISOString(),

      singleEvents: true,

      orderBy: "startTime",

      maxResults,
    });

  return (
    response.data.items ?? []
  ).map(formatEvent);
}

export async function createCalendarEvent({
  title,
  start,
  end,
  description,
  location,
  timeZone = "Europe/Paris",
}) {
  if (!title) {
    throw new Error(
      "Le titre est requis."
    );
  }

  if (!start) {
    throw new Error(
      "La date de début est requise."
    );
  }

  if (!end) {
    throw new Error(
      "La date de fin est requise."
    );
  }

  const calendar =
    await getCalendarClient();

  const response =
    await calendar.events.insert({
      calendarId: "primary",

      requestBody: {
        summary: title,

        description:
          description ||
          undefined,

        location:
          location ||
          undefined,

        start: {
          dateTime:
            start,

          timeZone,
        },

        end: {
          dateTime:
            end,

          timeZone,
        },
      },
    });

  return formatEvent(
    response.data
  );
}

export async function updateCalendarEvent({
  eventId,
  title,
  start,
  end,
  description,
  location,
  timeZone = "Europe/Paris",
}) {
  if (!eventId) {
    throw new Error(
      "eventId est requis."
    );
  }

  const calendar =
    await getCalendarClient();

  const current =
    await calendar.events.get({
      calendarId: "primary",
      eventId,
    });

  const currentEvent =
    current.data;

  const requestBody = {
    ...currentEvent,
  };

  if (title !== undefined) {
    requestBody.summary =
      title;
  }

  if (
    description !==
    undefined
  ) {
    requestBody.description =
      description;
  }

  if (
    location !==
    undefined
  ) {
    requestBody.location =
      location;
  }

  if (start) {
    requestBody.start = {
      dateTime:
        start,
      timeZone,
    };
  }

  if (end) {
    requestBody.end = {
      dateTime:
        end,
      timeZone,
    };
  }

  const response =
    await calendar.events.update({
      calendarId: "primary",

      eventId,

      requestBody,
    });

  return formatEvent(
    response.data
  );
}

export async function deleteCalendarEvent(
  eventId
) {
  if (!eventId) {
    throw new Error(
      "eventId est requis."
    );
  }

  const calendar =
    await getCalendarClient();

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });

  return {
    success: true,
    eventId,
  };
}