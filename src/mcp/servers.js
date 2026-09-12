export const mcpServers = {
  playwright: {
    command: "npx",

    args: [
      "-y",
      // Version épinglée : @playwright/mcp@latest (0.0.80) ferme la page
      // dès qu'un téléchargement est déclenché. 0.0.72 gère les
      // téléchargements de façon stable (événement download + saveAs).
      "@playwright/mcp@0.0.72",

      "--snapshot-mode",
      "none",

      "--image-responses",
      "omit",

      "--console-level",
      "error",
    ],
  },
};