import wol from "wakeonlan"
import "dotenv/config";

import { listSharedFolders, listNasFolder } from "../services/nas/files.js"

const targetMac = process.env.NAS_MAC;

//Démarrer le serveur avec Wake On LAN
export const wake_on_lan_nas = {
  declaration: {
    name: "wake_on_lan_nas",
    description: "Démarrer le serveur nas via Wake On Lane",

    /**parameters: {
      type: "object",
      properties: {},
    },**/
  },

  async execute() {
    try {
    await wol(targetMac);
    return "paquet envoyé"
  } catch (error) {
    return error
  }
  },
};


export const listSharedFoldersNas = {
    declaration: {
    name: "listSharedFoldersNas",
    description: "Lister les dossiers partagés a la racine du Nas",

    /**parameters: {
        type: "object",
        properties: {
            
        },
    },**/
  },

  async execute() {
    try {
    
    return await listSharedFolders()
  } catch (error) {
    return error
  }
  },
}


export const listNasFoldersNas = {
    declaration: {
    name: "listNasFoldersNas",
    description: "Lister le contenu du dossier donné par l'utilisateur",

    parameters: {
        type: "object",
        properties: {
            folder: {
                type: "string",
                description: "Dossier dans lequel nous voulons le détail du contenu. REGLES IMPORTANTES : ECRIS TOUJOURS LE CHEMIN DU DOSSIER AVEC LE / A GAUCHE DU DOSSIER ET JAMAIS A DROITE : EXEMPLE : /media"
            }
        },

        required: [
            "folder"
        ]
    },
  },

  async execute(args) {
    const folder = String(args.folder)
    try {
    
    return await listNasFolder(folder)
  } catch (error) {
    return error
  }
  },
}