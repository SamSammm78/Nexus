import "dotenv/config";

const TAVILY_API_KEY =
  process.env.TAVILY_API_KEY;

if (!TAVILY_API_KEY) {
  throw new Error(
    "TAVILY_API_KEY absent du fichier .env"
  );
}

async function searchWeb(query) {
  const response = await fetch(
    "https://api.tavily.com/search",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        api_key: TAVILY_API_KEY,

        query,

        search_depth: "basic",

        max_results: 5,

        include_answer: false,

        include_raw_content: false,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Tavily ${response.status}: ${JSON.stringify(data)}`
    );
  }

  return data;
}


async function main() {
  const query =
    "dernières actualités Porsche Macan 2026";

  console.log(
    `Recherche : ${query}\n`
  );

  const result =
    await searchWeb(query);

  console.log(
    `Temps Tavily : ${result.response_time ?? "?"} s\n`
  );

  for (
    const [index, item]
    of (result.results ?? []).entries()
  ) {
    console.log(
      `${index + 1}. ${item.title}`
    );

    console.log(
      item.url
    );

    console.log(
      item.content
    );

    console.log(
      "\n----------------------\n"
    );
  }
}


main().catch(error => {
  console.error(
    "\nErreur Tavily :",
    error.message
  );
});