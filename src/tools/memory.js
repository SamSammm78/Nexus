import { Type } from "@google/genai";

import {
  MEMORY_TYPES,
  rememberMemory,
  recallMemories,
  listMemories,
  updateMemory,
  forgetMemory,
  semanticRecall,
  semanticGraph,
  semanticDedupeList,
  semanticConsolidate,
} from "../memory/brain.js";


const STRING = Type.STRING;
const NUMBER = Type.NUMBER;
const ARRAY = Type.ARRAY;
const BOOLEAN = Type.BOOLEAN;

const typeParameter = {
  type: STRING,
  enum: MEMORY_TYPES,
  description:
    "Type de mémoire : fact, decision, preference, event, note.",
};

const projectParameter = {
  type: STRING,
  description:
    "Projet associé. À utiliser UNIQUEMENT pour un vrai projet (créé avec project_init), jamais pour le profil ou des infos personnelles.",
};

const limitParameter = {
  type: NUMBER,
  description:
    "Nombre de résultats (défaut 10).",
};

const contentParameter = {
  type: STRING,
  description:
    "Contenu de la note à mémoriser.",
};


export const memory_addTool = {
  declaration: {
    name: "memory_add",
    description:
      "Enregistre une information durable en mémoire (fait, décision, préférence...) sous forme de note Markdown. Ne mémorise pas le contenu de la conversation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: contentParameter,
        type: typeParameter,
        projectId: projectParameter,
        title: {
          type: STRING,
          description:
            "Titre court et descriptif de la note (défaut: dérivé du contenu).",
        },
        importance: {
          type: NUMBER,
          description:
            "Importance de 0.0 (anecdotique) à 1.0 (critique).",
        },
      },
      required: ["content"],
    },
  },

  execute: async (args = {}) => {
    const note = rememberMemory(args);
    return { id: note.id };
  },
};


export const memory_searchTool = {
  declaration: {
    name: "memory_search",
    description:
      "Recherche dans la mémoire longue (notes Obsidian). \"query\" : recherche SEMANTIQUE par le sens (phrase naturelle). Sinon : \"keywords\" (mots-clés). Retourne des notes compactées (extrait court).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: STRING,
          description:
            "Requête en langage naturel : recherche par similarité sémantique (\"ce que j'aime manger au petit-déjeuner\").",
        },
        keywords: {
          type: ARRAY,
          items: { type: STRING },
          description:
            "Mots-clés à chercher dans le contenu des notes (recherche lexicale).",
        },
        type: typeParameter,
        projectId: projectParameter,
        limit: limitParameter,
      },
    },
  },

  execute: async (args = {}) => {
    const limit = args.limit ?? 10;

    const notes = (
      args.query?.trim()
        ? await semanticRecall({
            query: args.query,
            type: args.type ?? null,
            projectId: args.projectId ?? null,
            limit,
          })
        : recallMemories({
            type: args.type ?? null,
            projectId: args.projectId ?? null,
            keywords: args.keywords ?? [],
            limit,
          })
    );

    return {
      count: notes.length,
      semantic: Boolean(args.query?.trim()),
      notes: notes.map(compactNote),
    };
  },
};


export const memory_listTool = {
  declaration: {
    name: "memory_list",
    description:
      "Liste les notes en mémoire, filtrées par type ou projet, de la plus récente à la plus ancienne. Retourne des notes compactées.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: typeParameter,
        projectId: projectParameter,
        limit: limitParameter,
      },
    },
  },

  execute: async (args = {}) => {
    const notes = listMemories({
      type: args.type ?? null,
      projectId: args.projectId ?? null,
      limit: args.limit ?? 50,
    });

    return {
      count: notes.length,
      notes: notes.map(compactNote),
    };
  },
};


export const memory_forgetTool = {
  declaration: {
    name: "memory_forget",
    description:
      "Supprime définitivement une note de mémoire par son id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: STRING,
          description:
            "Id de la note à supprimer (memory_search / memory_list).",
        },
      },
      required: ["id"],
    },
  },

  execute: async (args = {}) => {
    const deleted = forgetMemory(args.id);

    if (!deleted) {
      throw new Error(
        `Aucune note trouvée avec l'id : ${args.id}`
      );
    }

    return { deleted: true };
  },
};


export const memory_updateTool = {
  declaration: {
    name: "memory_update",
    description:
      "Modifie une note de mémoire (contenu, type, importance, projet) par son id.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: STRING,
          description:
            "Id de la note à modifier.",
        },
        content: contentParameter,
        type: typeParameter,
        projectId: projectParameter,
        importance: {
          type: NUMBER,
          description:
            "Importance de 0.0 à 1.0.",
        },
      },
      required: ["id"],
    },
  },

  execute: async (args = {}) => {
    const { id, ...patch } = args;

    const note = updateMemory(id, patch);

    if (!note) {
      throw new Error(
        `Aucune note trouvée avec l'id : ${id}`
      );
    }

    return { id: note.id };
  },
};


export const memory_dedupeTool = {
  declaration: {
    name: "memory_dedupe",
    description:
      "Détecte les notes quasi identiques (similarité d'embeddings) et, si dryRun=false, les consolide : le contenu des doublons est fusionné dans la note la plus riche puis les fichiers en trop sont supprimés.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dryRun: {
          type: BOOLEAN,
          description:
            "true (défaut) : liste les doublons sans rien modifier. false : fusionne et supprime.",
        },
        threshold: {
          type: NUMBER,
          description:
            "Seuil de similarité (0.9 par défaut).",
        },
      },
    },
  },

  execute: async (args = {}) => {
    const dryRun = args.dryRun !== false;
    const threshold = args.threshold ?? 0.9;

    if (dryRun) {
      const groups = await semanticDedupeList({ threshold });

      return {
        dryRun: true,
        groups: groups.length,
        candidates: groups.map(group => ({
          keeper: compactNote(group.keeper),
          duplicates:
            group.duplicates.map(compactNote),
        })),
      };
    }

    const summary = await semanticConsolidate({
      threshold,
      dryRun: false,
    });

    return {
      dryRun: false,
      ...summary,
    };
  },
};


export const memory_similarTool = {
  declaration: {
    name: "memory_similar",
    description:
      "Retourne les notes les plus proches sémantiquement d'une note donnée (graphe de mémoire).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: STRING,
          description:
            "Id de la note de référence (memory_search / memory_list).",
        },
        limit: limitParameter,
      },
      required: ["id"],
    },
  },

  execute: async (args = {}) => {
    const notes = await semanticGraph(args.id, {
      limit: args.limit ?? 5,
    });

    return {
      count: notes.length,
      notes: notes.map(compactNote),
    };
  },
};


function compactNote(note) {
  return {
    id: note.id,
    title: note.title,
    type: note.type,
    projectId: note.projectId,
    importance: note.importance,
    confidence: note.confidence,
    tags: note.tags,
    snippet: truncate(note.content, 150),
    created: note.created,
  };
}

function truncate(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max
    ? `${value.slice(0, max - 1)}…`
    : value;
}


export const memoryTools = [
  memory_addTool,
  memory_searchTool,
  memory_listTool,
  memory_updateTool,
  memory_forgetTool,
  memory_dedupeTool,
  memory_similarTool,
];