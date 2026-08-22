import fs from "node:fs/promises";
import path from "node:path";

import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";


// ======================================================
// CONFIG
// ======================================================

const CREDENTIALS_PATH =
  path.resolve(
    "credentials/google-oauth.json"
  );

const TOKEN_PATH =
  path.resolve(
    "credentials/google-token.json"
  );


// Lecture seule pour commencer
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
];


// ======================================================
// CHARGEMENT DU TOKEN EXISTANT
// ======================================================

async function loadSavedCredentials() {

  try {

    const content =
      await fs.readFile(
        TOKEN_PATH,
        "utf8"
      );

    const credentials =
      JSON.parse(
        content
      );

    return google.auth
      .fromJSON(
        credentials
      );

  } catch {

    return null;
  }
}


// ======================================================
// SAUVEGARDE DU TOKEN
// ======================================================

async function saveCredentials(
  client
) {

  const content =
    await fs.readFile(
      CREDENTIALS_PATH,
      "utf8"
    );

  const keys =
    JSON.parse(
      content
    );

  const key =
    keys.installed
    ?? keys.web;


  const payload = {
    type:
      "authorized_user",

    client_id:
      key.client_id,

    client_secret:
      key.client_secret,

    refresh_token:
      client.credentials
        .refresh_token,
  };


  await fs.writeFile(
    TOKEN_PATH,
    JSON.stringify(
      payload,
      null,
      2
    )
  );


  console.log(
    "\nToken sauvegardé :",
    TOKEN_PATH
  );
}


// ======================================================
// AUTHENTIFICATION
// ======================================================

async function authorize() {

  let client =
    await loadSavedCredentials();


  if (client) {

    console.log(
      "Token existant trouvé."
    );

    return client;
  }


  console.log(
    "Aucun token trouvé."
  );

  console.log(
    "Ouverture de l'authentification Google..."
  );


  client =
    await authenticate({
      scopes:
        SCOPES,

      keyfilePath:
        CREDENTIALS_PATH,
    });


  if (
    client.credentials
      .refresh_token
  ) {

    await saveCredentials(
      client
    );
  }


  return client;
}


// ======================================================
// LECTURE DES MAILS
// ======================================================

async function listRecentEmails(
  auth
) {

  const gmail =
    google.gmail({
      version:
        "v1",

      auth,
    });


  const response =
    await gmail.users
      .messages.list({

        userId:
          "me",

        maxResults:
          5,

      });


  const messages =
    response.data
      .messages
    ?? [];


  if (
    messages.length === 0
  ) {

    console.log(
      "Aucun mail trouvé."
    );

    return;
  }


  console.log(
    "\n5 derniers mails :\n"
  );


  for (
    const message
    of messages
  ) {

    const email =
      await gmail.users
        .messages.get({

          userId:
            "me",

          id:
            message.id,

          format:
            "metadata",

          metadataHeaders: [
            "From",
            "Subject",
            "Date",
          ],
        });


    const headers =
      email.data
        .payload
        ?.headers
      ?? [];


    const getHeader =
      name =>
        headers.find(
          header =>
            header.name
              ?.toLowerCase()
            ===
            name.toLowerCase()
        )?.value
        ?? "Inconnu";


    console.log(
      "--------------------------------"
    );

    console.log(
      "De :",
      getHeader(
        "From"
      )
    );

    console.log(
      "Sujet :",
      getHeader(
        "Subject"
      )
    );

    console.log(
      "Date :",
      getHeader(
        "Date"
      )
    );
  }
}


// ======================================================
// TEST
// ======================================================

async function main() {

  try {

    const auth =
      await authorize();


    console.log(
      "\nConnexion Gmail réussie."
    );


    await listRecentEmails(
      auth
    );

  } catch (
    error
  ) {

    console.error(
      "\nErreur Gmail :",
      error
    );
  }
}


main();