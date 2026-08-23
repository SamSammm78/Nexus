import { TuyaContext } from '@tuya/tuya-connector-nodejs';

import "dotenv/config";

const ACCESS_ID = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;
const DEVICE_ID = "03626837a4cf12c02de2";

// Initialisation du contexte avec le serveur Europe obligatoire
const tuya = new TuyaContext({
  baseUrl: 'https://openapi.tuyaeu.com',
  accessKey: ACCESS_ID,
  secretKey: ACCESS_SECRET,
});

async function controlerPrise(power_state) {
  try {
    // Définir l'action : true pour Allumer, false pour Éteindre
    const new_power_state = !power_state

    console.log(`Envoi de la commande à la prise Konyks (Statut cible : ${new_power_state})...`);

    // 2. Envoi de la requête HTTP POST à l'API Tuya
    const response = await tuya.request({
      method: 'POST',
      path: `/v1.0/iot-03/devices/${DEVICE_ID}/commands`,
      body: {
        commands: [
          {
            code: 'switch_1', // Note : Modifiez en 'switch' si votre modèle ne réagit pas
            value: new_power_state,
          },
        ],
      },
    });

    // 3. Vérification du résultat
    if (response.success) {
      console.log('Succès ! La commande a été transmise à la prise.');
    } else {
      console.error('L\'API a renvoyé une erreur :', response.msg);
    }
  } catch (error) {
    console.error('Erreur technique lors de l\'appel API :', error);
  }
}


async function obtenirEtatPrise() {
  try {
    console.log("Récupération de l'état de la prise...");

    // Envoi de la requête HTTP GET pour obtenir le statut
    const response = await tuya.request({
      method: 'GET',
      path: `/v1.0/iot-03/devices/${DEVICE_ID}/status`,
    });

    if (response.success) {
      // L'API renvoie un tableau contenant les différentes propriétés du produit (fonctions de statut)
      const statutTableau = response.result;
      
      // Recherche de la propriété de l'interrupteur (souvent 'switch_1' ou 'switch')
      const proprieteSwitch = statutTableau.find(item => item.code === 'switch_1' || item.code === 'switch');

      if (proprieteSwitch) {
        const estAllumee = proprieteSwitch.value;
        console.log(`L'état actuel de la prise est : ${estAllumee ? 'ALLUMÉE 🟢' : 'ÉTEINTE 🔴'}`);
        return estAllumee
      } else {
        console.log("Impossible de trouver le code de l'interrupteur dans les données reçues.");
        console.log("Données brutes reçues :", JSON.stringify(statutTableau, null, 2));
      }
    } else {
      console.error("L'API a renvoyé une erreur :", response.msg);
    }
  } catch (error) {
    console.error("Erreur technique lors de l'appel API :", error);
  }
}

const power_state = await obtenirEtatPrise();

//console.log(power_state)
//controlerPrise(power_state)


// Lancement de la fonction
//controlerPrise();


async function getDevice() {
  try {
   

    // 2. Envoi de la requête HTTP POST à l'API Tuya
    const response = await tuya.request({
      method: 'POST',
      path: `/v1.0/iot-03/devices/${DEVICE_ID}/commands`,
      body: {
        commands: [
          {
            code: 'countdown_1', // Note : Modifiez en 'switch' si votre modèle ne réagit pas
            value: 5,
          },
        ],
      },
    });

    // 3. Vérification du résultat
    if (response.success) {
      console.log(response)
    } else {
      console.error('L\'API a renvoyé une erreur :', response.msg);
    }
  } catch (error) {
    console.error('Erreur technique lors de l\'appel API :', error);
  }
}

getDevice()