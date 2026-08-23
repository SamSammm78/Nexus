import "dotenv/config";
import { Agent } from "undici"; // Importer l'Agent pour contourner le SSL

const NAS_IP = process.env.NAS_IP
const USERNAME = process.env.NAS_USERNAME;
const PASSWORD = process.env.NAS_PASSWORD;

// Créer la configuration qui ignore l'erreur de certificat expiré
const bypassSslAgent = new Agent({
  connect: { rejectUnauthorized: false }
});

export async function loginNas() {
  const loginUrl = `https://${NAS_IP}/webapi/entry.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(USERNAME)}&passwd=${encodeURIComponent(PASSWORD)}&format=cookie`;

  try {
    const response = await fetch(loginUrl, {
      dispatcher: bypassSslAgent // Appliquer l'agent ici
    });
    
    const result = await response.json();

    if (result.success) {
        const sid = result.data.sid;
        //Retourne le sid
        return sid;
    } else {
      console.error("Échec de l'authentification. Code d'erreur :", result.error);
    }
  } catch (error) {
    console.error("Erreur réseau :", error);
  }
}

export async function nasRequest({
  path = "entry.cgi",
  api,
  version = "1",
  method,
  params = {},
}) {
  const currentSid =
    await loginNas();

  const query = new URLSearchParams({
    api,
    version,
    method,
    _sid: currentSid,
    ...params,
  });

  const response = await fetch(
    `https://${NAS_IP}/webapi/${path}?${query}`,{
      dispatcher: bypassSslAgent // Appliquer l'agent ici
    });

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      `Erreur Synology ${api}: ${JSON.stringify(data.error)}`
    );
  }

  return data.data;
}

