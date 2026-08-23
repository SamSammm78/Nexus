import { ai } from "../config/gemini.js";


const VALID_ROUTES = [
  "DIRECT",
  "WEB_SEARCH",
  "BROWSER",
  "NATIVE",
  "NAVIGATION",
  "WEATHER",
  "GMAIL",
  "HOME_AUTOMATION",
  "NAS"
];

export async function routeRequest(
  message,
  history = []
) {

  const recentContext =
  history
    .slice(-4)
    .map(
      item => {

        const text =
          item.parts
            ?.map(
              part =>
                part.text
            )
            .filter(Boolean)
            .join(" ");

        return (
          `${item.role}: ${text}`
        );
      }
    )
    .join("\n");

  const prompt = `
Tu es le routeur de NEXUS.

Ton unique rôle est de déterminer
quelle capacité est nécessaire pour
traiter la demande utilisateur.

Tu dois choisir UNE seule catégorie.

CATÉGORIES :

DIRECT
La demande peut être traitée directement
par le modèle sans aucune information
externe actuelle et sans outil.

Exemples :
- explique-moi les promises JavaScript
- résume ce texte
- écris-moi un message
- qu'est-ce qu'une API REST


WEB_SEARCH
La demande nécessite une information
publique actuelle ou récente provenant
d'Internet.

Exemples :
- quelles sont les dernières nouvelles Tesla
- quel est le dernier MacBook sorti
- cherche les dernières politiques Etsy
- qui a gagné le match hier
- quel est le prix actuel de Bitcoin


BROWSER
Il faut réellement interagir avec
un site ou une page Web.

Exemples :
- ouvre YouTube
- va sur H&M
- trouve un produit sur Amazon
- clique sur ce bouton
- remplis ce formulaire
- connecte-toi à ce site


NATIVE
La demande nécessite une fonction locale
ou système de NEXUS.

Exemples :
- quelle heure est-il
- quelle est la date actuelle

NAVIGATION

Utiliser lorsqu'une demande concerne
un déplacement ou un itinéraire.

TRANSPORTS EN COMMUN :
- RER
- métro
- train
- bus
- tram
→ get_transit_journey

VOITURE :
- trajet en voiture
- route
- temps en voiture
- distance routière
- itinéraire voiture
→ get_driving_route

Exemples :

"Comment aller de Poissy à La Défense en RER ?"
→ NAVIGATION

"Combien de temps de Poissy à La Défense en voiture ?"
→ NAVIGATION

"Trouve-moi le trajet voiture de Paris à Lyon"
→ NAVIGATION

WEATHER
Utiliser pour toute demande concernant :

- météo actuelle
- prévisions météo
- température
- pluie ou neige
- vent
- qualité de l'air
- pollution
- pollen
- UV
- altitude
- conditions marines
- vagues
- crues et débit des rivières
- météo historique
- anciennes prévisions
- prévisions saisonnières
- données climatiques

Exemples :
- quel temps fait-il à Paris ?
- est-ce qu'il va pleuvoir demain ?
- quelle qualité de l'air à Lyon ?
- quel est le niveau de pollen aujourd'hui ?
- quelles vagues à Biarritz demain ?
- quelle était la température à Paris le 15 juillet 2024 ?
- quelle est l'altitude de Chamonix ?

GMAIL

Utiliser lorsqu'une demande concerne
les emails Gmail de l'utilisateur.

Exemples :

- quels mails ai-je reçus aujourd'hui ?
- montre-moi mes derniers emails
- ai-je des mails non lus ?
- cherche le mail d'Amazon
- retrouve le mail de mon professeur
- lis le dernier mail Etsy
- résume mes mails récents

HOME_AUTOMATION
Utiliser lorsqu'une demande concerne l'utilisation d'un appareil comme l'allumage ou l'éctinction de ce dernier.

Exemples :
Allume la lumière de mon bureau
Eteins la lumiere de mon bureau

NAS
Utiliser lorsqu'une demande concerne le serveur nas

Exemples :
Lancer le serveur nas via Wake On LAN


RÈGLES IMPORTANTES :

- Préfère DIRECT si aucun outil
  n'est réellement nécessaire.

- Ne choisis jamais BROWSER uniquement
  pour chercher ou lire une information
  publique.

- Pour une information récente,
  préfère WEB_SEARCH.

- BROWSER est réservé aux situations
  nécessitant une vraie interaction
  avec une page Web.

- Réponds uniquement avec :
DIRECT
WEB_SEARCH
BROWSER
NATIVE
WEATHER
GMAIL
HOME_AUTOMATION
NAS
ou
NAVIGATION

CONTEXTE RÉCENT :

${recentContext || "Aucun contexte"}

Demande utilisateur :

${message}
`;


  const response =
    await ai.models.generateContent({
      model:
        "gemini-3.5-flash-lite",

      contents:
        prompt,

      config: {
        thinkingConfig: {
          thinkingLevel:
            "minimal",
        },
      },
    });


  const route =
    response.text
      ?.trim()
      .toUpperCase();


  if (
    !VALID_ROUTES.includes(
      route
    )
  ) {

    console.warn(
      `[Route inconnue : ${route}]`
    );

    return "DIRECT";
  }


  return route;
}