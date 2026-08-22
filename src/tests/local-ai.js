const response = await fetch(
  "http://192.168.1.48:1234/v1/chat/completions",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      model: "google/gemma-4-e2b",



      messages: [
        {
          role: "user",
          content:
            "qui es tu ?",
        },
      ],

      stream: false,
    }),
  }
);

const data = await response.json();

console.log(
  "Réponse :",
  data.choices?.[0]?.message?.content
);
