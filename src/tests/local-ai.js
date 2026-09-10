const response = await fetch(
  "http://192.168.1.48:1234/v1/chat/completions",
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      model: "qwen2.5-coder-3b-instruct",



      messages: [
        {
          role: "user",
          content:
            "Qui es tu ?",
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
