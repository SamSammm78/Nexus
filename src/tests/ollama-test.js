import readline from "node:readline";

const OLLAMA_URL = "http://192.168.1.48";
const MODEL = "qwen2.5-coder-3b-instruct";

const history = [];

async function askOllama(message) {
  history.push({
    role: "user",
    content: message,
  });

  const response = await fetch(
    `${OLLAMA_URL}/api/chat`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: MODEL,

        stream: true,

        keep_alive: "10m",

        messages: [
          {
            role: "system",
            content: `
Tu es NEXUS, un assistant IA personnel.

Réponds directement à la question.
Sois très concis et utile. Ne repond seulement en quelques mots voire phrases.
Réponds en français si l'utilisateur parle français.
N'invente pas de conversation précédente.
            `.trim(),
          },

          ...history,
        ],

        options: {
          temperature: 0.4,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama error ${response.status}: ${await response.text()}`
    );
  }

  const reader =
    response.body.getReader();

  const decoder =
    new TextDecoder();

  let buffer = "";
  let answer = "";

  process.stdout.write("\nNEXUS > ");

  while (true) {
    const {
      value,
      done,
    } = await reader.read();

    if (done) break;

    buffer += decoder.decode(
      value,
      {
        stream: true,
      }
    );

    const lines =
      buffer.split("\n");

    buffer =
      lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      const data =
        JSON.parse(line);

      const token =
        data.message?.content;

      if (token) {
        process.stdout.write(
          token
        );

        answer += token;
      }
    }
  }

  process.stdout.write("\n");

  history.push({
    role: "assistant",
    content: answer,
  });
}

const rl =
  readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

function ask() {
  rl.question(
    "\nToi > ",
    async message => {
      const text =
        message.trim();

      if (
        text === "exit" ||
        text === "quit"
      ) {
        rl.close();
        return;
      }

      if (!text) {
        ask();
        return;
      }

      try {
        await askOllama(
          text
        );
      } catch (error) {
        console.error(
          "\nErreur :",
          error.message
        );
      }

      ask();
    }
  );
}

console.log(
  `Ollama connecté : ${OLLAMA_URL}`
);

console.log(
  `Modèle : ${MODEL}`
);

console.log(
  "Tape exit pour quitter."
);

ask();