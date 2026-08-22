import {
  generateGemini
} from "./gemini.js";


import {
  generateLocal
} from "./local.js";


let currentProvider =
  process.env.AI_PROVIDER
  || "gemini";


let currentLocalModel =
  process.env.LOCAL_MODEL
  || "qwen";

export function getCurrentModelLabel() {
  if (currentProvider === "gemini") {
    return "Gemini 3.5 Flash Lite";
  }

  if (currentLocalModel === "qwen") {
    return "Qwen 3.5 4B";
  }

  if (currentLocalModel === "gemma") {
    return "Gemma 4 E2B";
  }

  return "Unknown";
}

export function setAIProvider(
  provider
) {

  if (
    ![
      "gemini",
      "local",
    ].includes(provider)
  ) {

    throw new Error(
      `Provider inconnu : ${provider}`
    );
  }


  currentProvider =
    provider;


  console.log(
    `[AI] Provider → ${provider}`
  );
}


export function setLocalModel(
  model
) {

  if (
    ![
      "qwen",
      "gemma",
    ].includes(model)
  ) {

    throw new Error(
      `Modèle local inconnu : ${model}`
    );
  }


  currentLocalModel =
    model;


  console.log(
    `[AI] Local model → ${model}`
  );
}


export function getAIConfig() {

  return {
    provider:
      currentProvider,

    localModel:
      currentLocalModel,
  };
}


export async function generateText({
  prompt,
  systemPrompt = "",
  provider = currentProvider,
  localModel = currentLocalModel,
}) {

  const label =
    provider === "gemini"
      ? "Gemini 3.5 Flash Lite"
      : localModel === "qwen"
        ? "Qwen 3.5 4B"
        : "Gemma 4 E2B";

  console.log(
    `[NEXUS AI] ${label}`
  );

  if (
    provider === "local"
  ) {

    return generateLocal({
      prompt,
      systemPrompt,
      model:
        localModel,
    });
  }

  return generateGemini({
    prompt,
    systemPrompt,
  });
}