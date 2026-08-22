import { Type } from "@google/genai";

export const timeTool = {
  declaration: {
    name: "get_current_time",
    description:
      "Retourne l'heure et la date actuelles.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  execute: async () => ({
    time:
      new Date().toLocaleTimeString("fr-FR"),

    date:
      new Date().toLocaleDateString("fr-FR"),
  }),
};