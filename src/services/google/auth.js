import fs from "node:fs/promises";
import path from "node:path";

import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

const CREDENTIALS_PATH =
  path.resolve(
    "credentials/google-oauth.json"
  );

const TOKEN_PATH =
  path.resolve(
    "credentials/google-token.json"
  );

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose"
];

async function loadSavedCredentials() {

  try {

    const content =
      await fs.readFile(
        TOKEN_PATH,
        "utf8"
      );

    const credentials =
      JSON.parse(content);

    return google.auth.fromJSON(
      credentials
    );

  } catch {

    return null;
  }
}


async function saveCredentials(
  client
) {

  const content =
    await fs.readFile(
      CREDENTIALS_PATH,
      "utf8"
    );

  const keys =
    JSON.parse(content);

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
}


export async function getGoogleAuth() {

  let client =
    await loadSavedCredentials();

  if (client) {

    return client;
  }


  console.log(
    "[Google] Authentification requise..."
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