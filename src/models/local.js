const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL;


const LOCAL_MODELS = {
  qwen: "qwen3.5-4b",
  gemma: "google/gemma-4-e2b",
};


function getLocalModelId(
  modelName
) {

  const modelId =
    LOCAL_MODELS[
      modelName
    ];


  if (!modelId) {

    throw new Error(
      `Modèle local inconnu : ${modelName}`
    );
  }


  return modelId;
}


function extractAnswer(data) {

  const outputs =
    data.output ?? [];


  const parts = [];


  for (
    const item of outputs
  ) {

    if (
      item.type !== "message"
    ) {
      continue;
    }


    for (
      const content of
      item.content ?? []
    ) {

      if (
        typeof content.text
        === "string"
      ) {

        parts.push(
          content.text
        );
      }
    }
  }


  return parts
    .join("")
    .trim();
}


export async function generateLocal({
  prompt,
  systemPrompt = "",
  model =
    process.env.LOCAL_MODEL
    || "qwen",
}) {

  const modelId =
    getLocalModelId(
      model
    );


  console.log(
    `[LOCAL AI] ${model} → ${modelId}`
  );


  const input = [
    systemPrompt,
    prompt,
  ]
    .filter(Boolean)
    .join("\n\n");


  const response =
    await fetch(
      `${LM_STUDIO_URL}/api/v1/chat`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            model:
              modelId,

            input,

            stream:
              false,
          }),
      }
    );


  if (!response.ok) {

    const error =
      await response.text();


    throw new Error(
      `LM Studio HTTP ${response.status}: ${error}`
    );
  }


  const data =
    await response.json();


  return extractAnswer(
    data
  );
}