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

import { routeRequest } from "./router.js";
import { startMapServer } from "../services/map/server.js";

import {
  addUserMessage,
  addAssistantMessage,
  getHistory,
} from "../memory/shortTerm.js";

import {
  initBrain,
  recallMemories,
} from "../memory/brain.js";
import { getActiveProject } from "../memory/state.js";


// ============================================================
// STATE
// ============================================================

let mcpTools = [];
let playwrightDeclarations = [];
let nexusInitialized = false;
let initializationPromise = null;


// ============================================================
// GEMINI CHAT
// ============================================================

function createChat(toolDeclarations = [], history = []) {
  const config = {
    systemInstruction: systemPrompt,
    thinkingConfig: {
      thinkingLevel: "minimal",
    },
  };

  if (toolDeclarations.length) {
    config.tools = [
      {
        functionDeclarations: toolDeclarations,
      },
    ];
  }

  return ai.chats.create({
    model: "gemini-3.5-flash-lite",
    history,
    config,
  });
}


// ============================================================
// INITIALISATION
// ============================================================

export async function startNexus() {
  if (nexusInitialized) return;

  // Évite deux initialisations simultanées.
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    console.log("Initialisation de NEXUS...");

    initBrain();

    startMapServer();

    mcpTools = await connectMcpServers();

    playwrightDeclarations = mcpTools
      .filter(item => item.server === "playwright")
      .map(({ server, tool }) => ({
        name: tool.name,
        description:
          tool.description ??
          `Outil Playwright ${server}`,
        parameters:
          tool.inputSchema ?? {
            type: "object",
            properties: {},
          },
      }));


    nexusInitialized = true;
  })();

  try {
    await initializationPromise;
  } catch (error) {
    // Autorise une nouvelle tentative si l'initialisation échoue.
    initializationPromise = null;
    nexusInitialized = false;

    throw error;
  }
}


// ============================================================
// ROUTE → TOOLS
// ============================================================

// Les outils mémoire sont disponibles sur toutes les routes :
// NEXUS peut retenir une information importante quel que soit
// le contexte (agenda ajouté au calendrier, adresse, préférence...).
const memoryDeclarations = getNativeDeclarations()
  .filter(
    tool => tool.name.startsWith("memory_")
  );

function getToolsForRoute(route) {
  switch (route) {
    case "WEB_SEARCH":
      return [
        getNativeDeclaration("search_web"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "NATIVE":
      return getNativeDeclarations().filter(
        tool => tool.name !== "search_web"
      );

    case "BROWSER":
      return playwrightDeclarations
        .concat(
          getNativeDeclaration("download_file")
        )
        .concat(
          getNativeDeclaration("browser_download_pdf")
        )
        .concat(memoryDeclarations)
        .filter(Boolean);

    case "NAVIGATION":
      return [
        getNativeDeclaration("get_transit_journey"),
        getNativeDeclaration("get_transit_disruptions"),
        getNativeDeclaration("get_driving_route"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "WEATHER":
      return [
        getNativeDeclaration("get_weather_data"),
      ].filter(Boolean).concat(memoryDeclarations);

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
        getNativeDeclaration("list_labels"),
        getNativeDeclaration("add_label_to_email"),
        getNativeDeclaration("remove_label_from_email"),
        getNativeDeclaration("forward_email"),
        getNativeDeclaration("batch_mark_read"),
        getNativeDeclaration("batch_archive"),
        getNativeDeclaration("batch_trash"),
        getNativeDeclaration("list_attachments"),
        getNativeDeclaration("download_attachment"),
        getNativeDeclaration("list_threads"),
        getNativeDeclaration("read_thread"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "CALENDAR":
      return [
        getNativeDeclaration("get_upcoming_events"),
        getNativeDeclaration("search_calendar_events"),
        getNativeDeclaration("get_calendar_events_between"),
        getNativeDeclaration("create_calendar_event"),
        getNativeDeclaration("update_calendar_event"),
        getNativeDeclaration("delete_calendar_event"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "HOME_AUTOMATION":
      return [
        getNativeDeclaration("changeDeviceState"),
        getNativeDeclaration("getDeviceId"),
        getNativeDeclaration("getDeviceState"),
        getNativeDeclaration("setCountdown"),
      ].filter(Boolean).concat(memoryDeclarations);


    case "NAS":
      return [
        getNativeDeclaration("wake_on_lan_nas"),
        getNativeDeclaration("listSharedFoldersNas"),
        getNativeDeclaration("listNasFoldersNas"),
        getNativeDeclaration("getPingNas"),
        getNativeDeclaration("setNasStatus"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "FILES":
      return [
        getNativeDeclaration("file_search"),
        getNativeDeclaration("file_list"),
        getNativeDeclaration("file_read"),
        getNativeDeclaration("file_write"),
        getNativeDeclaration("file_mkdir"),
        getNativeDeclaration("file_move"),
        getNativeDeclaration("file_copy"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "LOCATION":
      return [
        getNativeDeclaration("get_current_location"),
        getNativeDeclaration("place_add"),
        getNativeDeclaration("place_list"),
        getNativeDeclaration("place_get"),
        getNativeDeclaration("place_remove"),
        getNativeDeclaration("place_distance"),
      ].filter(Boolean).concat(memoryDeclarations);

    case "DIRECT":
    default:
      return memoryDeclarations;
  }
}


// ============================================================
// TOOL EXECUTION
// ============================================================

async function executeTool(call) {
  const toolName = call.name;
  const args = call.args ?? {};

  const nativeTool = getNativeDeclarations().find(
    tool => tool.name === toolName
  );

  if (nativeTool) {
    return executeNativeTool(
      toolName,
      args
    );
  }

  const mcpTool = mcpTools.find(
    item => item.tool.name === toolName
  );

  if (mcpTool) {
    return callMcpTool(
      mcpTool.server,
      toolName,
      args
    );
  }

  throw new Error(
    `Outil inconnu : ${toolName}`
  );
}


// ============================================================
// NEXUS CORE
// ============================================================

function buildMessageParts(message, files = []) {
  const parts = [];

  if (message?.trim()) {
    parts.push({
      text: message,
    });
  }

  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data,
      },
    });
  }

  return parts;
}

export async function askNexus(
  message,
  { onEvent = () => {}, files = [] } = {}
) {
  if (!message?.trim() && files.length === 0) return "";

  await startNexus();

  const messageParts =
    buildMessageParts(message, files);

  try {
    const memory = getHistory();

    clearUsage();

    const memoryBlock = buildMemoryContext(message);

    const messageParts = memoryBlock
      ? [
          { text: memoryBlock },
          ...buildMessageParts(message, files),
        ]
      : buildMessageParts(message, files);

    // --------------------------------------------------------
    // ROUTING
    // --------------------------------------------------------

    onEvent({
      type: "thinking",
    });

    // Message vide avec fichiers → analyse directe, pas d'outils.
    const hasFilesOnly =
      !message?.trim() && files.length > 0;

    const route = hasFilesOnly
      ? "DIRECT"
      : await routeRequest(message, memory);

    onEvent({
      type: "route",
      route,
    });

    // --------------------------------------------------------
    // TOOLS
    // --------------------------------------------------------

    const selectedTools =
      getToolsForRoute(route);

    onEvent({
      type: "tools_selected",
      tools: selectedTools.map(
        tool => tool.name
      ),
    });

    // --------------------------------------------------------
    // GEMINI
    // --------------------------------------------------------

    const chat = createChat(
      selectedTools,
      memory
    );

    let response = await chat.sendMessage({
      message: messageParts,
    });

    trackUsage(response.usageMetadata);

    // --------------------------------------------------------
    // AGENT LOOP
    // --------------------------------------------------------

    let step = 0;
    const maxSteps = 25;

    while (
      response.functionCalls?.length &&
      step < maxSteps
    ) {
      step++;

      onEvent({
        type: "step",
        step,
      });

      const functionResponses = [];

      for (const call of response.functionCalls) {
        const toolName = call.name;

        onEvent({
          type: "tool_start",
          tool: toolName,
          args: call.args ?? {},
        });

        let result;

        try {
          result = await executeTool(call);

          onEvent({
            type: "tool_end",
            tool: toolName,
          });
        } catch (error) {
          result = {
            error: true,
            message:
              error?.message ??
              String(error),
          };

          onEvent({
            type: "tool_error",
            tool: toolName,
            error: result.message,
          });
        }

        // Fichiers visuels (image, PDF) : le contenu est joint au
        // modèle via functionResponse.parts.inlineData au lieu du JSON.
        const filePart = [];

        if (
          result &&
          typeof result === "object" &&
          typeof result.base64 === "string" &&
          typeof result.mimeType === "string"
        ) {
          filePart.push({
            inlineData: {
              mimeType: result.mimeType,
              data: result.base64,
            },
          });

          const { base64, ...rest } = result;

          result = {
            ...rest,
            attached: true,
            label:
              rest.label ??
              rest.name ??
              "fichier visuel",
          };

          onEvent({
            type: "file_attached",
            tool: toolName,
            mimeType: rest.mimeType,
            size: rest.size,
          });
        }

        functionResponses.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response: {
              result,
            },
            ...(filePart.length
              ? { parts: filePart }
              : {}),
          },
        });
      }

      // Gemini réfléchit de nouveau après les tools.
      onEvent({
        type: "thinking",
      });

      response = await chat.sendMessage({
        message: functionResponses,
      });

      trackUsage(response.usageMetadata);
    }

    // --------------------------------------------------------
    // TOKEN USAGE
    // --------------------------------------------------------

    onEvent({
      type: "usage",
      usage,
    });

    // --------------------------------------------------------
    // LOOP PROTECTION
    // --------------------------------------------------------

    if (
      step >= maxSteps &&
      response.functionCalls?.length
    ) {
      const answer =
        "J'ai interrompu la tâche car elle demandait trop d'étapes.";

      saveConversation(
        message,
        files,
        answer
      );

      onEvent({
        type: "final",
        text: answer,
      });

      return answer;
    }

    // --------------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------------

    const answer =
      response.text?.trim() ||
      "Aucun texte retourné.";

    saveConversation(
      message,
      files,
      answer
    );

    onEvent({
      type: "final",
      text: answer,
    });

    return answer;

  } catch (error) {
    onEvent({
      type: "error",
      error,
    });

    throw error;
  }
}


// ============================================================
// MEMORY
// ============================================================

let usage = {
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  cachedContentTokenCount: 0,
  totalTokenCount: 0,
};

function trackUsage(metadata = {}) {
  usage.promptTokenCount +=
    metadata.promptTokenCount ?? 0;
  usage.candidatesTokenCount +=
    metadata.candidatesTokenCount ?? 0;
  usage.cachedContentTokenCount +=
    metadata.cachedContentTokenCount ?? 0;
  usage.totalTokenCount =
    usage.promptTokenCount +
    usage.candidatesTokenCount;
}

function clearUsage() {
  usage.promptTokenCount = 0;
  usage.candidatesTokenCount = 0;
  usage.cachedContentTokenCount = 0;
  usage.totalTokenCount = 0;
}

function buildMemoryContext(message) {
  try {
    const activeProject = getActiveProject();

    let memories = recallMemories({
      keywords: extractKeywords(message),
      projectId: activeProject,
      limit: 3,
    });

    if (!memories.length && activeProject) {
      memories = recallMemories({
        keywords: extractKeywords(message),
        limit: 3,
      });
    }

    if (!memories.length) return "";

    const lines = memories.map(
      note => {
        const project =
          note.projectId
            ? ` (projet ${note.projectId})`
            : "";

        return (
          `- [${note.type}]${project} ` +
          truncate(note.content, 160)
        );
      }
    );

    const header =
      "Projet actif : " +
      (activeProject || "—") +
      "\nRappels mémoire :\n";

    return (
      header +
      lines.join("\n")
    );
  } catch {
    return "";
  }
}

function extractKeywords(message) {
  return String(message ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 4)
    .filter((word, index, all) => all.indexOf(word) === index)
    .slice(0, 8);
}

function truncate(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max
    ? `${value.slice(0, max - 1)}…`
    : value;
}

function saveConversation(
  userMessage,
  files,
  assistantMessage
) {
  addUserMessage(userMessage, files);
  addAssistantMessage(assistantMessage);
}