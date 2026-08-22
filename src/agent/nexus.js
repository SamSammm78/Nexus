import readline from "node:readline";

import { ai } from "../config/gemini.js";
import { systemPrompt } from "./systemPrompt.js";

import {
  connectMcpServers,
  callMcpTool,
} from "../mcp/client.js";

import {
  getNativeDeclarations,
  getNativeDeclaration,
  executeNativeTool,
} from "../tools/index.js";

import {
  routeRequest,
} from "./router.js";

import {
  startMapServer
} from "../map/server.js";

import {
  addUserMessage,
  addAssistantMessage,
  getHistory,
  clearHistory,
} from "../memory/shortTerm.js";

import {
  generateText,
} from "../models/index.js";


// ======================================================
// CRÉATION D'UN CHAT GEMINI AVEC UNIQUEMENT
// LES OUTILS NÉCESSAIRES
// ======================================================

function createChat(
  toolDeclarations = [],
  history = []
) {

  const config = {

    systemInstruction:
      systemPrompt,

    thinkingConfig: {
      thinkingLevel:
        "minimal",
    },
  };


  if (
    toolDeclarations.length > 0
  ) {

    config.tools = [
      {
        functionDeclarations:
          toolDeclarations,
      },
    ];
  }


  return ai.chats.create({

    model:
      "gemini-3.5-flash-lite",

    history,

    config,
  });
}


// ======================================================
// DÉMARRAGE DE NEXUS
// ======================================================

export async function startNexus() {

  console.log(
    "Initialisation de NEXUS..."
  );

  // DÉMARRAGE DU SERVEUR MAP
  startMapServer();

  // ====================================================
  // 1. CONNEXION AUX SERVEURS MCP
  // ====================================================

  const mcpTools =
    await connectMcpServers();


  console.log(
    `${mcpTools.length} outils MCP chargés.`
  );


  // ====================================================
  // 2. RÉCUPÉRATION DES OUTILS PLAYWRIGHT
  // ====================================================

  const playwrightTools =
    mcpTools.filter(
      item =>
        item.server ===
        "playwright"
    );


  const playwrightDeclarations =
    playwrightTools.map(
      ({ server, tool }) => ({

        name:
          tool.name,

        description:
          tool.description ??
          `Outil Playwright ${server}`,

        parameters:
          tool.inputSchema ?? {
            type: "object",
            properties: {},
          },

      })
    );


  console.log(
    `${playwrightDeclarations.length} outils Playwright disponibles.`
  );


  // ====================================================
  // 3. CHOIX DES OUTILS SELON LA ROUTE
  // ====================================================

  function getToolsForRoute(
    route
  ) {

    switch (route) {


      // ================================================
      // RECHERCHE WEB
      // ================================================

      case "WEB_SEARCH":

        return [
          getNativeDeclaration(
            "search_web"
          ),
        ].filter(Boolean);


      // ================================================
      // OUTILS NATIFS
      // ================================================

      case "NATIVE":

        return getNativeDeclarations()
          .filter(
            tool =>
              tool.name !==
              "search_web"
          );


      // ================================================
      // NAVIGATEUR
      // ================================================

      case "BROWSER":

        return playwrightDeclarations;


      // ================================================
      // NAVIGATION / IDFM
      // ================================================

      case "NAVIGATION":

        return [

          getNativeDeclaration(
            "get_transit_journey"
          ),

          getNativeDeclaration(
            "get_transit_disruptions"
          ),

          getNativeDeclaration(
            "get_driving_route"
          ),

        ].filter(Boolean);

      // ================================================
      // MÉTÉO
      // ================================================

      case "WEATHER":

        return [
          getNativeDeclaration(
            "get_weather_data"
          ),
        ].filter(Boolean);

      // ================================================
      // GMAIL
      // ================================================

     case "GMAIL":
  return [
    getNativeDeclaration("get_recent_emails"),
    getNativeDeclaration("search_emails"),
    getNativeDeclaration("read_email"),

    getNativeDeclaration("create_email_draft"),
    getNativeDeclaration("get_email_drafts"),
    getNativeDeclaration("create_reply_draft"),

    getNativeDeclaration("mark_email_read"),
    getNativeDeclaration("mark_email_unread"),
    getNativeDeclaration("archive_email"),
    getNativeDeclaration("trash_email"),

    getNativeDeclaration("send_email_draft"),
  ].filter(Boolean);

      // ================================================
      // RÉPONSE DIRECTE
      // ================================================

      case "DIRECT":
      default:

        return [];
    }
  }


  // ====================================================
  // 4. EXÉCUTION D'UN OUTIL
  // ====================================================

  async function executeTool(
    call
  ) {

    const toolName =
      call.name;

    const args =
      call.args ?? {};


    // ==================================================
    // OUTILS NATIFS
    // ==================================================

    const nativeTool =
      getNativeDeclarations()
        .find(
          tool =>
            tool.name ===
            toolName
        );


    if (nativeTool) {

      console.log(
        `[outil natif : ${toolName}]`
      );


      return await executeNativeTool(
        toolName,
        args
      );
    }


    // ==================================================
    // OUTILS MCP
    // ==================================================

    const mcpTool =
      mcpTools.find(
        item =>
          item.tool.name ===
          toolName
      );


    if (mcpTool) {

      console.log(
        `[outil MCP : ${mcpTool.server}/${toolName}]`
      );


      return await callMcpTool(
        mcpTool.server,
        toolName,
        args
      );
    }


    throw new Error(
      `Outil inconnu : ${toolName}`
    );
  }


  // ====================================================
  // 5. TERMINAL
  // ====================================================

  const rl =
    readline.createInterface({

      input:
        process.stdin,

      output:
        process.stdout,

    });


  console.log(
    "\nNEXUS démarré."
  );

  console.log(
    "Tape 'exit' pour quitter."
  );


  // ====================================================
  // 6. BOUCLE DE CONVERSATION
  // ====================================================

  function askQuestion() {

    rl.question(
      "\nToi > ",

      async (message) => {


        // ==============================================
        // MESSAGE VIDE
        // ==============================================

        if (
          !message.trim()
        ) {

          askQuestion();

          return;
        }


        // ==============================================
        // QUITTER NEXUS
        // ==============================================

        if (
          message
            .trim()
            .toLowerCase() ===
            "exit" ||

          message
            .trim()
            .toLowerCase() ===
            "quit"
        ) {

          console.log(
            "\nNEXUS > À bientôt."
          );

          rl.close();

          return;
        }


        try {


          // ============================================
          // 7. ROUTAGE
          // ============================================

          const memory = getHistory();

          const route =
            await routeRequest(
              message,
              memory
            );


          console.log(
            `[Route : ${route}]`
          );

          

          // ============================================
          // 8. CHOIX DES OUTILS
          // ============================================

          const selectedTools =
            getToolsForRoute(
              route
            );


          console.log(
            `[Outils exposés : ${selectedTools.length}]`
          );


          if (
            selectedTools.length > 0
          ) {

            console.log(
              selectedTools
                .map(
                  tool =>
                    `- ${tool.name}`
                )
                .join("\n")
            );
          }


          // ============================================
          // 9. CRÉATION DU CHAT
          // ============================================

          const chat =
          createChat(
            selectedTools,
            memory
          );


          // ============================================
          // 10. PREMIER MESSAGE VERS GEMINI
          // ============================================

          let response =
            await chat.sendMessage({

              message,

            });


          // ============================================
          // 11. BOUCLE AGENTIQUE
          // ============================================

          let step = 0;

          const maxSteps =
            25;


          while (
            response
              .functionCalls
              ?.length &&

            step <
              maxSteps
          ) {

            step++;


            console.log(
              `\n--- Étape ${step} ---`
            );


            const functionResponses =
              [];


            // Gemini peut demander
            // plusieurs outils dans
            // une même réponse.

            for (
              const call
              of response.functionCalls
            ) {


              console.log(
                `Gemini demande : ${call.name}`
              );


              console.log(
                "Arguments :",
                call.args ?? {}
              );


              // ========================================
              // EXÉCUTION RÉELLE DE L'OUTIL
              // ========================================

              let result;


              try {

                result =
                  await executeTool(
                    call
                  );

              }

              catch (
                toolError
              ) {

                console.error(
                  `Erreur outil ${call.name} :`,
                  toolError
                );


                result = {

                  error:
                    true,

                  message:
                    toolError.message ??
                    String(
                      toolError
                    ),
                };
              }


              console.log(
                "Résultat reçu."
              );


              // ========================================
              // RÉSULTAT RENVOYÉ À GEMINI
              // ========================================

              functionResponses.push({

                functionResponse: {

                  id:
                    call.id,

                  name:
                    call.name,

                  response: {
                    result,
                  },
                },
              });
            }


            // ==========================================
            // GEMINI REÇOIT LES RÉSULTATS
            // ==========================================

            response =
              await chat.sendMessage({

                message:
                  functionResponses,

              });
          }


          // ============================================
          // 12. PROTECTION CONTRE BOUCLE INFINIE
          // ============================================

          if (
            step >=
            maxSteps
          ) {

            console.log(
              "\nNEXUS > J'ai interrompu la tâche car elle demandait trop d'étapes."
            );
          }

          else {


            // ==========================================
            // 13. RÉPONSE FINALE
            // ==========================================

            const answer =
              response.text
                ?.trim();


            if (
              answer
            ) {
              addUserMessage(
                message
              );

              addAssistantMessage(
                answer
              );

              console.log(
                "\nNEXUS >",
                answer
              );
            }

            else {

              console.log(
                "\nNEXUS > Aucun texte retourné."
              );
            }
          }

        }

        catch (
          error
        ) {

          console.error(
            "\nErreur NEXUS :",
            error
          );
        }


        // ==============================================
        // QUESTION SUIVANTE
        // ==============================================

        askQuestion();
      }
    );
  }


  // ====================================================
  // 14. LANCEMENT
  // ====================================================

  askQuestion();
}