import {
  ai
} from "../config/gemini.js";


export async function generateGemini({
  prompt,
  systemPrompt = "",
}) {

  const response =
    await ai.models.generateContent({
      model:
        "gemini-3.5-flash-lite",

      contents: [
        systemPrompt,
        prompt,
      ]
        .filter(Boolean)
        .join("\n\n"),

      config: {
        thinkingConfig: {
          thinkingLevel:
            "minimal",
        },
      },
    });


  return (
    response.text
      ?.trim()
    ?? ""
  );
}