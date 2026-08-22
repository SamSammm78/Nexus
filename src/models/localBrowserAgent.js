const LM_STUDIO_URL =
  process.env.LM_STUDIO_URL;

const LOCAL_MODELS = {
  qwen:
    "qwen3.5-4b",

  gemma:
    "google/gemma-4-e2b",
};


function getModelId() {

  const model =
    process.env.LOCAL_MODEL
    || "qwen";

  const id =
    LOCAL_MODELS[model];

  if (!id) {

    throw new Error(
      `Modèle local inconnu : ${model}`
    );
  }

  return id;
}


function convertTools(
  declarations
) {

  return declarations.map(
    tool => ({

      type:
        "function",

      function: {

        name:
          tool.name,

        description:
          tool.description ?? "",

        parameters:
          tool.parameters ?? {
            type: "object",
            properties: {},
          },
      },
    })
  );
}


export async function runLocalBrowserAgent(
  message,
  playwrightDeclarations,
  executeTool
) {

  const model =
    getModelId();

  console.log(
    `[LOCAL BROWSER] ${model}`
  );


  const tools =
    convertTools(
      playwrightDeclarations
    );


  const messages = [

    {
      role:
        "system",

      content: `
Tu es NEXUS.

Tu contrôles un navigateur Web
avec les outils Playwright disponibles.

Tu dois accomplir la demande utilisateur.

Règles :

- Utilise les outils lorsque nécessaire.
- N'invente jamais le résultat d'une action.
- Observe la page avant de décider si nécessaire.
- Continue jusqu'à ce que la tâche soit terminée.
- Ne donne une réponse finale que lorsque
  l'action demandée est réellement accomplie.
`,
    },

    {
      role:
        "user",

      content:
        message,
    },

  ];


  const maxSteps =
    20;


  for (
    let step = 0;
    step < maxSteps;
    step++
  ) {

    console.log(
      `[LOCAL BROWSER étape ${step + 1}]`
    );


    const response =
      await fetch(
        `${LM_STUDIO_URL}/v1/chat/completions`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({

              model,

              messages,

              tools,

              tool_choice:
                "auto",

              temperature:
                0.1,

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


    const assistant =
      data.choices?.[0]
        ?.message;


    if (!assistant) {

      throw new Error(
        "LM Studio n'a retourné aucun message."
      );
    }


    messages.push(
      assistant
    );


    const toolCalls =
      assistant.tool_calls
      ?? [];


    // ==========================================
    // AUCUN OUTIL = RÉPONSE FINALE
    // ==========================================

    if (
      toolCalls.length === 0
    ) {

      return (
        assistant.content
          ?.trim()
        ||
        "Tâche terminée."
      );
    }


    // ==========================================
    // EXÉCUTION DES OUTILS
    // ==========================================

    for (
      const call
      of toolCalls
    ) {

      const toolName =
        call.function?.name;


      let args = {};


      try {

        args =
          JSON.parse(
            call.function
              ?.arguments
            || "{}"
          );

      } catch {

        console.warn(
          `[LOCAL BROWSER] Arguments JSON invalides pour ${toolName}`
        );
      }


      console.log(
        `[LOCAL demande : ${toolName}]`
      );

      console.log(
        "Arguments :",
        args
      );


      let result;


      try {

        result =
          await executeTool({
            name:
              toolName,

            args,
          });

      } catch (error) {

  console.error(
    `[ERREUR TOOL ${toolName}]`,
    error
  );

  result = {
    error: true,
    message:
      error.message,
  };
}


      messages.push({

        role:
          "tool",

        tool_call_id:
          call.id,

        content:
          JSON.stringify(
            result
          ),

      });
    }
  }


  return (
    "J'ai interrompu la tâche car elle demandait trop d'étapes."
  );
}