import { Type } from "@google/genai";

import {
  initProject,
  setProjectHub,
  projectCheckpoint,
  projectLog,
  projectResume,
  listProjects,
} from "../memory/brain.js";


const STRING = Type.STRING;

const projectIdParameter = {
  type: STRING,
  description:
    "Nom du projet (projectId).",
};

const contentParameter = {
  type: STRING,
  description:
    "Contenu de la note.",
};

const PROJECT_STATUS = [
  "active",
  "paused",
  "done",
  "archived",
];


export const project_initTool = {
  declaration: {
    name: "project_init",
    description:
      "Crée ou réactive un projet : souche dans le vault Obsidian (projets/) avec statut, objectif. Utilise-le quand tu découvres un nouveau projet.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: {
          type: STRING,
          description:
            "Nom du projet.",
        },
        goal: {
          type: STRING,
          description:
            "Objectif principal (1 phrase).",
        },
        status: {
          type: STRING,
          enum: PROJECT_STATUS,
          description:
            "Statut initial (défaut active).",
        },
      },
      required: ["name"],
    },
  },

  execute: async (args = {}) => {
    const hub = initProject({
      name: args.name,
      goal: args.goal ?? null,
      status: args.status ?? "active",
    });

    return {
      projectId:
        hub.projectId ?? hub.title,
      id: hub.id,
      status: hub.status ?? "active",
      goal: hub.goal ?? null,
    };
  },
};


export const project_setTool = {
  declaration: {
    name: "project_set",
    description:
      "Met à jour l'état du projet (statut, objectif, jalons, prochaine action). Met à jour le frontmatter de la souche projet.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: projectIdParameter,
        status: {
          type: STRING,
          enum: PROJECT_STATUS,
        },
        goal: {
          type: STRING,
          description:
            "Objectif principal, 1 phrase.",
        },
        milestones: {
          type: STRING,
          description:
            "Jalons, séparés par des virgules (max 5).",
        },
        nextAction: {
          type: STRING,
          description:
            "Prochaine action concrète.",
        },
      },
      required: ["projectId"],
    },
  },

  execute: async (args = {}) => {
    const { projectId, ...patch } = args;

    const hub = setProjectHub(projectId, patch);

    return {
      projectId,
      status: hub.status ?? "active",
      goal: hub.goal ?? null,
      milestones: hub.milestones ?? null,
      nextAction: hub.nextAction ?? null,
    };
  },
};


export const project_checkpointTool = {
  declaration: {
    name: "project_checkpoint",
    description:
      "Écrit un point de contrôle du projet : bilan court, chaîné aux précédents, et met à jour lastCheckpoint (+ prochaine action si donnée).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: projectIdParameter,
        summary: {
          type: STRING,
          description:
            "Bilan du checkpoint (2-3 phrases).",
        },
        nextAction: {
          type: STRING,
          description:
            "Prochaine action concrète (facultatif).",
        },
      },
      required: ["projectId", "summary"],
    },
  },

  execute: async (args = {}) => {
    const checkpoint = projectCheckpoint({
      projectId: args.projectId,
      summary: args.summary,
      nextAction: args.nextAction ?? null,
    });

    return { id: checkpoint.id };
  },
};


export const project_logTool = {
  declaration: {
    name: "project_log",
    description:
      "Journalise une activité ou une décision pour un projet (note liée à la souche projet).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: projectIdParameter,
        kind: {
          type: STRING,
          enum: ["activity", "decision"],
          description:
            "activity (journal) ou decision (décision + contexte).",
        },
        content: contentParameter,
      },
      required: ["projectId", "kind", "content"],
    },
  },

  execute: async (args = {}) => {
    const note = projectLog({
      projectId: args.projectId,
      kind: args.kind,
      content: args.content,
    });

    return {
      id: note.id,
      type: note.type,
    };
  },
};


export const project_statusTool = {
  declaration: {
    name: "project_status",
    description:
      "État d'un projet : statut, objectif, jalons, prochaine action, dernières activités/décisions.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: projectIdParameter,
      },
      required: ["projectId"],
    },
  },

  execute: async (args = {}) => {
    const resume = projectResume(args.projectId);

    if (!resume) {
      throw new Error(
        `Projet introuvable : ${args.projectId}`
      );
    }

    return resume;
  },
};


export const project_resumeTool = {
  declaration: {
    name: "project_resume",
    description:
      "Reprend un projet : rappelle son état, sa prochaine action et le fil des derniers événements/décisions. À appeler quand l'utilisateur dit « on reprend / continue le projet X ».",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectId: projectIdParameter,
      },
      required: ["projectId"],
    },
  },

  execute: async (args = {}) => {
    const resume = projectResume(args.projectId);

    if (!resume) {
      throw new Error(
        `Projet introuvable : ${args.projectId}`
      );
    }

    return resume;
  },
};


export const project_listTool = {
  declaration: {
    name: "project_list",
    description:
      "Liste tous les projets (nom, statut, prochaine action).",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  execute: async () => {
    return {
      count: listProjects().length,
      projects: listProjects(),
    };
  },
};


export const projectTools = [
  project_initTool,
  project_setTool,
  project_checkpointTool,
  project_logTool,
  project_statusTool,
  project_resumeTool,
  project_listTool,
];