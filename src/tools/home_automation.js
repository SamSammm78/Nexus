import { TuyaContext } from '@tuya/tuya-connector-nodejs';

import "dotenv/config";
import fs from "fs/promises"

const ACCESS_ID = process.env.TUYA_ACCESS_ID;
const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;

// Initialisation du contexte avec le serveur Europe obligatoire
const tuya = new TuyaContext({
  baseUrl: 'https://openapi.tuyaeu.com',
  accessKey: ACCESS_ID,
  secretKey: ACCESS_SECRET,
});

export const changeDeviceState = {
    declaration: {
        name: "changeDeviceState",
        description: "Changer l'état de l'appareil connecté, allumer ou éteindre l'appareil",

        parameters: {
            type: "object",

            properties: {
                power_state: {
                    type: "boolean",
                    description: "True pour allumer, False pour éteindre",
                },
                device_id: {
                    type: "string",
                    description: "ID du l'appareil à allumer ou éteindre"
                }
            },

            required: [
                "power_state",
                "device_id"
            ]
        },
    },

    async execute(args){
        const power_state = Boolean(args.power_state);
        const device_id = String(args.device_id)


        try {
            // 2. Envoi de la requête HTTP POST à l'API Tuya
            const response = await tuya.request({
            method: 'POST',
            path: `/v1.0/iot-03/devices/${device_id}/commands`,
            body: {
                commands: [
                {
                    code: 'switch_1', // Note : Modifiez en 'switch' si votre modèle ne réagit pas
                    value: power_state,
                },
                ],
            },
            });

            // 3. Vérification du résultat
            if (response.success) {
                return response
            } else {
                return response
            }
        } catch (error) {
            return error
        }
        
    }
}


export const getDeviceId = {

    declaration: {
        name: "getDeviceId",
        description: "Récuperer la liste des mes appareils ainsi que leurs emplacements, leurs type et leurs ids",
    },

    async execute(){
        const devices = await fs.readFile('data/devices.json', 'utf-8');
        return devices
    }

}

export const getDeviceState = {
    declaration: {
        name: "getDeviceState",
        description: "récuperer l'état de l'appareil connecté, si il est allumé ou éteint, retourne une valeur booléan : True est allumé, False est éteint",

        parameters: {
            type: "object",

            properties: {
                device_id: {
                    type: "string",
                    description: "ID du l'appareil à allumer ou éteindre"
                }
            },

            required: [
                "device_id"
            ]
        },
    },

    async execute(args){
        const device_id = String(args.device_id)

        try {
            // Envoi de la requête HTTP GET pour obtenir le statut
            const response = await tuya.request({
            method: 'GET',
            path: `/v1.0/iot-03/devices/${device_id}/status`,
            });

            if (response.success) {
            // L'API renvoie un tableau contenant les différentes propriétés du produit (fonctions de statut)
            const statutTableau = response.result;
            
            // Recherche de la propriété de l'interrupteur (souvent 'switch_1' ou 'switch')
            const proprieteSwitch = statutTableau.find(item => item.code === 'switch_1' || item.code === 'switch');

            if (proprieteSwitch) {
                const estAllumee = proprieteSwitch.value;
                return estAllumee
            } else {
                return JSON.stringify(statutTableau, null, 2)
            }
            } else {
                return response.msg
            }
        } catch (error) {
            return error
        }
    }
}


export const setCountdown = {
    declaration: {
        name: "setCountdown",
        description: "ajouter un compte a rebours avant l'allumagne ou l'extinction de l'appareil, temps en seconde",

        parameters: {
            type: "object",

            properties: {
                time: {
                    type: "number",
                    description: "temps avant l'execution, en seconde",
                },
                device_id: {
                    type: "string",
                    description: "ID du l'appareil à allumer ou éteindre"
                }
            },

            required: [
                "time",
                "device_id"
            ]
        },
    },

    async execute(args){
        const time = Number(args.time);
        const device_id = String(args.device_id)


        try {
            // 2. Envoi de la requête HTTP POST à l'API Tuya
            const response = await tuya.request({
            method: 'POST',
            path: `/v1.0/iot-03/devices/${device_id}/commands`,
            body: {
                commands: [
                {
                    code: 'countdown_1', // Note : Modifiez en 'switch' si votre modèle ne réagit pas
                    value: time,
                },
                ],
            },
            });

            // 3. Vérification du résultat
            if (response.success) {
                return response
            } else {
                return response
            }
        } catch (error) {
            return error
        }
        
    }
}