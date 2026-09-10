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
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar"
];

// Marge de sécurité avant expiration du token (5 min)
const EXPIRY_MARGIN_MS =
  5 * 60 * 1000;

// Client en cache pour éviter les re-chargements inutiles
let cachedClient = null;

// Singleton : une seule authentification à la fois
let authPromise = null;

let forceRefresh = false;


function isTokenFresh(client) {

  const creds =
    client?.credentials;

  const expiry =
    creds?.expiry_date;

  if (
    !creds?.refresh_token
  ) {

    // Pas d'accès aux tokens de refresh → considérer frais
    return true;
  }

  if (
    !expiry
  ) {

    // Pas de date d'expiration → on refresh la première fois
    return false;
  }

  return (
    Date.now() + EXPIRY_MARGIN_MS
    <
    expiry
  );
}


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


async function saveCredentialFile(
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

  const creds =
    client.credentials;

  const payload = {
    type:
      "authorized_user",

    client_id:
      key.client_id,

    client_secret:
      key.client_secret,

    refresh_token:
      creds.refresh_token,

    ...(creds.access_token
      ? { access_token: creds.access_token }
      : {}),

    ...(creds.expiry_date
      ? { expiry_date: creds.expiry_date }
      : {}),
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


async function refreshToken(client) {

  if (
    !client?.credentials
      ?.refresh_token
  ) {

    return client;
  }


  console.log(
    "[Google] Refresh du token..."
  );


  try {

    await client.refreshAccessToken();

    console.log(
      "[Google] Token rafraîchi."
    );


    await saveCredentialFile(
      client
    );


  } catch (error) {

    console.warn(
      "[Google] Refresh échoué :",
      error?.message
    );
  }


  return client;
}


export async function getGoogleAuth() {

  // Auth en cours → on attend le même résultat
  if (
    authPromise
  ) {

    return authPromise;
  }


  authPromise = (async () => {

    // Client déjà frais en cache → retour direct
    if (
      cachedClient &&
      !forceRefresh
    ) {

      if (
        isTokenFresh(cachedClient)
      ) {

        return cachedClient;
      }

      // Token proche de l'expiration → refresh
      await refreshToken(
        cachedClient
      );

      return cachedClient;
    }


    // Chargement depuis le disque
    let client =
      cachedClient ??
      await loadSavedCredentials();

    if (client) {

      if (
        forceRefresh ||
        !isTokenFresh(client)
      ) {

        await refreshToken(
          client
        );
      }

      cachedClient =
        client;

      return client;
    }


    // Aucun token → autorisation interactive
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

      await saveCredentialFile(
        client
      );
    }


    cachedClient =
      client;

    return client;

  })();


  try {

    return await authPromise;

  } finally {

    authPromise = null;

    forceRefresh = false;
  }
}


// Force un nouveau refresh au prochain appel.
// À utiliser après une erreur 401/403.
export function resetGoogleAuth() {

  cachedClient = null;

  forceRefresh = true;
}