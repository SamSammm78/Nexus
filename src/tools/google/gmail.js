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
  listLabels,
  addLabelToEmail,
  removeLabelFromEmail,
  forwardEmail,
  batchMarkRead,
  batchArchive,
  batchTrash,
  getEmailAttachments,
  downloadAttachment,
  listThreads,
  readThread,
} from "../../services/google/gmail.js";

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
          pageToken: {
            type: "string",
            description: "Token de pagination retourné par une requête précédente pour obtenir la page suivante.",
          },
        },
      },
    },
    execute: async ({ maxResults = 10, pageToken }) => {
      return getRecentEmails({ maxResults, pageToken });
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
          pageToken: {
            type: "string",
            description: "Token de pagination pour la page suivante.",
          },
        },
        required: ["query"],
      },
    },
    execute: async ({ query, maxResults = 10, pageToken }) => {
      return searchEmails({
        query,
        maxResults,
        pageToken,
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
        "Envoie un brouillon Gmail existant. Nécessite une confirmation explicite de l'utilisateur avant l'appel.",
      parameters: {
        type: "object",
        properties: {
          draftId: {
            type: "string",
            description: "ID du brouillon à envoyer.",
          },
          confirmed: {
            type: "boolean",
            description:
              "Doit être obligatoirement true. À ne passer que si l'utilisateur a explicitement confirmé l'envoi à haute voix ou par écrit.",
          },
        },
        required: ["draftId", "confirmed"],
      },
    },
    execute: async ({ draftId, confirmed }) => {
      if (confirmed !== true) {
        throw new Error(
          "Envoi refusé : confirmation explicite requise. Demande d'abord à l'utilisateur de confirmer."
        );
      }

      return sendDraft(draftId);
    },
  },

  // ======================================================
  // LABELS
  // ======================================================

  {
    declaration: {
      name: "list_labels",
      description: "Liste tous les labels Gmail de l'utilisateur.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    execute: async () => {
      return listLabels();
    },
  },

  {
    declaration: {
      name: "add_label_to_email",
      description: "Ajoute un label à un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email.",
          },
          labelId: {
            type: "string",
            description: "ID du label à ajouter.",
          },
        },
        required: ["messageId", "labelId"],
      },
    },
    execute: async ({ messageId, labelId }) => {
      return addLabelToEmail(messageId, labelId);
    },
  },

  {
    declaration: {
      name: "remove_label_from_email",
      description: "Retire un label d'un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email.",
          },
          labelId: {
            type: "string",
            description: "ID du label à retirer.",
          },
        },
        required: ["messageId", "labelId"],
      },
    },
    execute: async ({ messageId, labelId }) => {
      return removeLabelFromEmail(messageId, labelId);
    },
  },

  // ======================================================
  // FORWARD
  // ======================================================

  {
    declaration: {
      name: "forward_email",
      description: "Transmet un email à un autre destinataire. Nécessite une confirmation explicite de l'utilisateur avant l'appel.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email à transmettre.",
          },
          to: {
            type: "string",
            description: "Adresse email du destinataire.",
          },
          confirmed: {
            type: "boolean",
            description:
              "Doit être obligatoirement true. À ne passer que si l'utilisateur a explicitement confirmé l'envoi.",
          },
        },
        required: ["messageId", "to", "confirmed"],
      },
    },
    execute: async ({ messageId, to, confirmed }) => {
      if (confirmed !== true) {
        throw new Error(
          "Transfert refusé : confirmation explicite requise. Demande d'abord à l'utilisateur de confirmer."
        );
      }

      return forwardEmail({ messageId, to });
    },
  },

  // ======================================================
  // BATCH OPERATIONS
  // ======================================================

  {
    declaration: {
      name: "batch_mark_read",
      description: "Marque plusieurs emails comme lus en une seule opération.",
      parameters: {
        type: "object",
        properties: {
          messageIds: {
            type: "array",
            items: { type: "string" },
            description: "Liste des IDs des emails à marquer comme lus.",
          },
        },
        required: ["messageIds"],
      },
    },
    execute: async ({ messageIds }) => {
      return batchMarkRead(messageIds);
    },
  },

  {
    declaration: {
      name: "batch_archive",
      description: "Archive plusieurs emails en une seule opération.",
      parameters: {
        type: "object",
        properties: {
          messageIds: {
            type: "array",
            items: { type: "string" },
            description: "Liste des IDs des emails à archiver.",
          },
        },
        required: ["messageIds"],
      },
    },
    execute: async ({ messageIds }) => {
      return batchArchive(messageIds);
    },
  },

  {
    declaration: {
      name: "batch_trash",
      description: "Déplace plusieurs emails dans la corbeille en une seule opération.",
      parameters: {
        type: "object",
        properties: {
          messageIds: {
            type: "array",
            items: { type: "string" },
            description: "Liste des IDs des emails à supprimer.",
          },
        },
        required: ["messageIds"],
      },
    },
    execute: async ({ messageIds }) => {
      return batchTrash(messageIds);
    },
  },

  // ======================================================
  // PIÈCES JOINTES
  // ======================================================

  {
    declaration: {
      name: "list_attachments",
      description: "Liste les pièces jointes d'un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email.",
          },
        },
        required: ["messageId"],
      },
    },
    execute: async ({ messageId }) => {
      return getEmailAttachments(messageId);
    },
  },

  {
    declaration: {
      name: "download_attachment",
      description: "Télécharge une pièce jointe d'un email Gmail.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description: "ID de l'email.",
          },
          attachmentId: {
            type: "string",
            description: "ID de la pièce jointe.",
          },
        },
        required: ["messageId", "attachmentId"],
      },
    },
    execute: async ({ messageId, attachmentId }) => {
      return downloadAttachment({ messageId, attachmentId });
    },
  },

  // ======================================================
  // THREADS
  // ======================================================

  {
    declaration: {
      name: "list_threads",
      description: "Liste les conversations Gmail (threads) avec pagination.",
      parameters: {
        type: "object",
        properties: {
          maxResults: {
            type: "number",
            description: "Nombre maximum de threads à retourner.",
          },
          query: {
            type: "string",
            description: "Requête Gmail pour filtrer les threads.",
          },
          pageToken: {
            type: "string",
            description: "Token de pagination pour la page suivante.",
          },
        },
      },
    },
    execute: async ({ maxResults = 10, query, pageToken }) => {
      return listThreads({ maxResults, query, pageToken });
    },
  },

  {
    declaration: {
      name: "read_thread",
      description: "Lit tous les messages d'une conversation Gmail (thread).",
      parameters: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "ID du thread à lire.",
          },
        },
        required: ["threadId"],
      },
    },
    execute: async ({ threadId }) => {
      return readThread(threadId);
    },
  },
];
