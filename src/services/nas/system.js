import {
  nasRequest,
} from "./client.js";

import "dotenv/config";
import tls from "tls";

// Récupération de votre nouvelle variable propre sans le port
const NAS_IP = process.env.NAS_IP_SIMPLE || "192.168.1.63";
const NAS_PORT = 5001;

function checkNasStatus() {
  return new Promise((resolve) => {
    // Connexion sécurisée en ignorant l'alerte de certificat local
    const socket = tls.connect(NAS_PORT, NAS_IP, { rejectUnauthorized: false });
    
    socket.setTimeout(2000); // 2 secondes max avant abandon
    
    // Cas 1 : Le serveur répond sur le port sécurisé
    socket.on('secureConnect', () => {
      socket.destroy();
      resolve({ online: true, message: "nas is on" });
    });
    
    // Cas 2 : Pas de réponse du tout (Serveur éteint)
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ online: false, message: "nas time out : nas is off" });
    });
    
    // Cas 3 : Problème réseau ou machine injoignable
    socket.on('error', () => {
      socket.destroy();
      resolve({ online: false, message: "net error or nas is off" });
    });
  });
}

// Exemple d'utilisation
export async function pingNas() {
  const info = await checkNasStatus();
  
  // Vous récupérez un objet clair et réutilisable dans vos conditions
  if (info.online) {
    return `🟢 Succès : ${info.message}`
  } else {
    return `🔴 Échec : ${info.message}`
  }
}

const ALLOWED_MODES = ["shutdown", "reboot"];

export async function setStatus(mode) {
  if (!ALLOWED_MODES.includes(mode)) {
    return "error";
  }

  return nasRequest({
    api: 'SYNO.Core.System',
    version: '1',
    method: mode 
  });
}