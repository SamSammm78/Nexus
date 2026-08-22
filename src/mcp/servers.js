export const mcpServers = {
  playwright: {
    command: "npx",

    args: [
      "-y",
      "@playwright/mcp@latest",

      "--snapshot-mode",
      "none",

      "--image-responses",
      "omit",

      "--console-level",
      "error",
    ],
  },
};