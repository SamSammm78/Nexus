import { tavily } from "@tavily/core";
import "dotenv/config";

const tvly = tavily({
  apiKey: process.env.TAVILY_API_KEY,
});


export const webSearchTool = {

  declaration: {
    name: "search_web",

    description:
      `
      Recherche rapidement des informations récentes sur Internet.

      À utiliser lorsque :
      - l'information peut avoir changé récemment ;
      - l'utilisateur demande des actualités ;
      - une information actuelle est nécessaire ;
      - il faut vérifier une information publique sur le Web.

      Ne pas utiliser pour :
      - une question générale connue ;
      - ouvrir ou contrôler un site ;
      - cliquer ou remplir une page web.

      Pour interagir avec un site, utiliser plutôt les outils navigateur.
      `,

    parameters: {
      type: "OBJECT",

      properties: {
        query: {
          type: "STRING",

          description:
            "Search query to send to Tavily.",
        },
      },

      required: [
        "query",
      ],
    },
  },


  async execute({
    query
  }) {

    console.log(
      `[Tavily : ${query}]`
    );


    const result =
      await tvly.search(
        query,
        {
          searchDepth:
            "basic",

          maxResults:
            5,

          includeRawContent:
            false,

          includeImages:
            false,
        }
      );


    // ==================================================
    // VERSION LÉGÈRE POUR LE LLM
    // ==================================================

    const resultsForLLM =
      (result.results ?? [])
        .map(
          item => ({

            title:
              item.title ?? null,

            url:
              item.url ?? null,

            snippet:
              item.content ?? null,

          })
        );


    return {
      query,

      results:
        resultsForLLM,
    };
  },
};


