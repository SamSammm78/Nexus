const OLLAMA_URL = "http://nexus.local:12345";
const MODEL = "qwen2.5:1.5b";

async function streamOllama(prompt) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: true,

      // Garde le modèle chargé en mémoire
      // pour accélérer les requêtes suivantes
      keep_alive: "10m",

      options: {
        temperature: 0.5,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();

    throw new Error(
      `Ollama error ${response.status}: ${error}`
    );
  }

  if (!response.body) {
    throw new Error("Aucun flux reçu depuis Ollama.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let fullResponse = "";

  const startTime = Date.now();
  let firstTokenTime = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const lines = buffer.split("\n");

    // La dernière ligne peut être incomplète
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let data;

      try {
        data = JSON.parse(line);
      } catch (error) {
        console.error(
          "\nJSON invalide reçu :",
          line
        );

        continue;
      }

      if (data.response) {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();

          console.log(
            `\nPremier token : ${
              firstTokenTime - startTime
            } ms\n`
          );
        }

        // Affichage instantané
        process.stdout.write(data.response);

        fullResponse += data.response;
      }

      if (data.done) {
        const totalTime =
          Date.now() - startTime;

        console.log("\n");

        console.log(
          `Temps total : ${totalTime} ms`
        );

        if (data.eval_count && data.eval_duration) {
          const tokensPerSecond =
            data.eval_count /
            (data.eval_duration / 1_000_000_000);

          console.log(
            `Vitesse : ${tokensPerSecond.toFixed(
              2
            )} tokens/s`
          );
        }

        return {
          text: fullResponse,
          stats: data,
        };
      }
    }
  }

  return {
    text: fullResponse,
    stats: null,
  };
}

async function main() {
  const prompt =
    process.argv.slice(2).join(" ") ||
    "Présente-toi en quelques phrases.";

  console.log(`Modèle : ${MODEL}`);
  console.log(`Serveur : ${OLLAMA_URL}`);
  console.log(`Prompt : ${prompt}`);

  console.log("\nNEXUS :");

  try {
    await streamOllama(prompt);
  } catch (error) {
    console.error("\nErreur :", error.message);
  }
}

main();