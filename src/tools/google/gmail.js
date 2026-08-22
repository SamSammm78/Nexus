import {
  getRecentEmails,
  searchEmails,
  readEmail,
  createDraft,
  getDrafts,
  createReplyDraft,
  markEmailRead,
  markEmailUnread,
  archiveEmail,
  trashEmail,
  sendDraft,
} from "../../google/gmail.js";

export const gmailTools = [
  {
    declaration: {
      name: "get_recent_emails",
      description: "Récupère les emails récents de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Nombre maximum d'emails à retourner.",
          },
        },
      },
    },
    execute: async ({ maxResults = 10 }) => {
      return getRecentEmails({ maxResults });
    },
  },

  {
    declaration: {
      name: "search_emails",
      description: "Recherche des emails Gmail avec une requête Gmail.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Requête Gmail, par exemple from:etsy.com ou is:unread.",
          },
          maxResults: {
            type: "number",
          },
        },
        required: ["query"],
      },
    },
    execute: async ({ query, maxResults = 10 }) => {
      return searchEmails({
        query,
        maxResults,
      });
    },
  },

  {
    declaration: {
      name: "read_email",
      description: "Lit le contenu complet d'un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return readEmail(messageId);
    },
  },

  {
    declaration: {
      name: "create_email_draft",
      description: "Crée un brouillon d'email sans l'envoyer.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Adresse email du destinataire.",
          },
          subject: {
            type: "string",
          },
          body: {
            type: "string",
          },
        },
        required: [
          "to",
          "subject",
          "body",
        ],
      },
    },
    execute: async ({
      to,
      subject,
      body,
    }) => {
      return createDraft({
        to,
        subject,
        body,
      });
    },
  },

  {
    declaration: {
      name: "get_email_drafts",
      description: "Liste les brouillons Gmail récents.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
          },
        },
      },
    },
    execute: async ({ maxResults = 10 }) => {
      return getDrafts({
        maxResults,
      });
    },
  },

  {
    declaration: {
      name: "create_reply_draft",
      description: "Crée un brouillon de réponse à un email existant.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email auquel répondre.",
          },
          body: {
            type: "string",
            description: "Contenu de la réponse.",
          },
        },
        required: [
          "messageId",
          "body",
        ],
      },
    },
    execute: async ({
      messageId,
      body,
    }) => {
      return createReplyDraft({
        messageId,
        body,
      });
    },
  },

  {
    declaration: {
      name: "mark_email_read",
      description: "Marque un email comme lu.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return markEmailRead(messageId);
    },
  },

  {
    declaration: {
      name: "mark_email_unread",
      description: "Marque un email comme non lu.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return markEmailUnread(messageId);
    },
  },

  {
    declaration: {
      name: "archive_email",
      description: "Archive un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return archiveEmail(messageId);
    },
  },

  {
    declaration: {
      name: "trash_email",
      description: "Déplace un email Gmail dans la corbeille.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return trashEmail(messageId);
    },
  },

  {
    declaration: {
      name: "send_email_draft",
      description:
        "Envoie un brouillon Gmail existant. À utiliser uniquement après confirmation explicite de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          draftId: {
            type: "string",
          },
        },
        required: ["draftId"],
      },
    },
    execute: async ({ draftId }) => {
      return sendDraft(draftId);
    },
  },
];