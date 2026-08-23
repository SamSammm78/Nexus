import wol from "wakeonlan"
import "dotenv/config";

const targetMac = process.env.NAS_MAC;


async function bootComputer() {
  try {
    await wol(targetMac);
    console.log(`🚀 Paquet magique WoL envoyé avec succès à ${targetMac}`);
  } catch (error) {
    console.error(`❌ Échec de l'envoi du paquet :`, error);
  }
}

bootComputer();