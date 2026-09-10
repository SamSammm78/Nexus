import {
  google
} from "googleapis";

import {
  getGoogleAuth,
  resetGoogleAuth,
} from "./auth.js";


async function getGmail() {
  const auth = await getGoogleAuth();

  return google.gmail({
    version: "v1",
    auth,
  });
}


// ======================================================
// RETRY + ERROR HANDLING
// ======================================================

// Masque les données sensibles dans les messages d'erreur
function sanitizeErrorMessage(message) {

  if (!message) return "";

  return String(message)
    // Emails
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[email]"
    )
    // Tokens / clés (32+ caractères)
    .replace(
      /[A-Za-z0-9\-_]{32,}/g,
      "[secret]"
    )
    // Corps de mail potentiels dans l'erreur
    .split(/\r?\n/)
    .filter(line =>
      !/^(from|to|cc|bcc|subject|in-reply-to|references):/i.test(
        line.trim()
      )
    )
    .join("\n")
    // Longues erreurs tronquées
    .slice(0, 500);
}

function applySanitization(error) {

  if (!error) return error;

  const message =
    sanitizeErrorMessage(
      error?.message ?? String(error)
    );

  const sanitized =
    new Error(message);

  sanitized.name =
    error.name || "Error";

  sanitized.code =
    error.code;

  sanitized.status =
    error.status;

  sanitized.statusCode =
    error.statusCode;

  return sanitized;
}


async function gmailCall(fn, { retries = 2 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const gmail = await getGmail();
      return await fn(gmail);
    } catch (error) {
      lastError = error;

      const status =
        error?.response?.status ??
        error?.code;

      // Token expiré → reset auth + retry une fois
      if (
        (status === 401 || status === 403) &&
        attempt === 0
      ) {
        console.warn(
          `[Gmail] Auth error (${status}), re-auth...`
        );

        resetGoogleAuth();

        continue;
      }

      // Rate limit → backoff exponentiel
      if (status === 429) {
        const delay =
          1000 * Math.pow(2, attempt);

        console.warn(
          `[Gmail] Rate limited, retry dans ${delay}ms...`
        );

        await new Promise(
          r => setTimeout(r, delay)
        );

        continue;
      }

      // Erreurs serveur → retry
      if (status >= 500 && attempt < retries) {
        const delay =
          1000 * Math.pow(2, attempt);

        await new Promise(
          r => setTimeout(r, delay)
        );

        continue;
      }

      // Erreurs non retryables ou retries épuisés
      break;
    }
  }

  throw applySanitization(lastError);
}

function encodeMessage({ to, subject, body, inReplyTo, references }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
  }

  if (references) {
    headers.push(`References: ${references}`);
  }

  const message = [
    ...headers,
    "",
    body,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}




function getHeader(
  headers,
  name
) {

  return (
    headers.find(
      header =>
        header.name
          ?.toLowerCase()
        ===
        name.toLowerCase()
    )
      ?.value
    ?? ""
  );
}


function decodeBase64Url(data) {
  if (!data) return "";

  const normalized = data
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  return Buffer.from(normalized, "base64").toString("utf-8");
}

function extractBodies(payload) {
  const plainParts = [];
  const htmlParts = [];

  function walk(part) {
    if (!part) return;

    const mimeType = part.mimeType || "";
    const bodyData = part.body?.data;

    if (mimeType === "text/plain" && bodyData) {
      plainParts.push(decodeBase64Url(bodyData));
    }

    if (mimeType === "text/html" && bodyData) {
      htmlParts.push(decodeBase64Url(bodyData));
    }

    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);

  return {
    plain: plainParts.join("\n\n").trim(),
    html: htmlParts.join("\n\n").trim(),
  };
}


// ======================================================
// MAILS RÉCENTS
// ======================================================

export async function getRecentEmails({
  maxResults = 20,
  query = "",
  pageToken = undefined,
} = {}) {

  return gmailCall(async (gmail) => {

    const response =
      await gmail.users
        .messages.list({

          userId:
            "me",

          maxResults,

          q:
            query || undefined,

          pageToken:
            pageToken || undefined,
        });


    const messages =
      response.data
        .messages
      ?? [];

    const nextPageToken =
      response.data
        .nextPageToken
      ?? null;


    const emails =
      [];


    for (
      const message
      of messages
    ) {

      const email =
        await gmail.users
          .messages.get({

            userId:
              "me",

            id:
              message.id,

            format:
              "metadata",

            metadataHeaders: [
              "From",
              "To",
              "Subject",
              "Date",
            ],
          });


      const headers =
        email.data
          .payload
          ?.headers
        ?? [];


      emails.push({

        id:
          email.data.id,

        threadId:
          email.data.threadId,

        from:
          getHeader(
            headers,
            "From"
          ),

        to:
          getHeader(
            headers,
            "To"
          ),

        subject:
          getHeader(
            headers,
            "Subject"
          ),

        date:
          getHeader(
            headers,
            "Date"
          ),

        snippet:
          email.data
            .snippet
          ?? "",

      });
    }


    return {
      emails,
      nextPageToken,
    };

  });
}


// ======================================================
// RECHERCHE
// ======================================================

export async function searchEmails({
  query,
  maxResults = 10,
  pageToken = undefined,
}) {
  if (!query) {
    throw new Error("query est obligatoire.");
  }

  return getRecentEmails({ maxResults, query, pageToken });
}


// ======================================================
// LECTURE D'UN MAIL
// ======================================================

export async function readEmail(messageId) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const message = response.data;

    const headers =
      message.payload?.headers || [];

    const bodies =
      extractBodies(message.payload);

    let body = bodies.plain;

    if (!body && bodies.html) {
      body = bodies.html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
    }

    return {
      id: message.id,
      threadId: message.threadId,

      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),

      body,
    };

  });
}

export async function createDraft({
  to,
  subject,
  body,
  threadId = undefined,
  inReplyTo = undefined,
  references = undefined,
}) {
  return gmailCall(async (gmail) => {

    const raw = encodeMessage({
      to,
      subject,
      body,
      inReplyTo,
      references,
    });

    const response = await gmail.users.drafts.create({
      userId: "me",

      requestBody: {
        message: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
      },
    });

    return {
      draftId: response.data.id,
      messageId: response.data.message?.id,
      threadId: response.data.message?.threadId,
      to,
      subject,
    };

  });
}

export async function getDrafts({
  maxResults = 10,
} = {}) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.drafts.list({
      userId: "me",
      maxResults,
    });

    const drafts = response.data.drafts || [];

    const results = [];

    for (const draft of drafts) {
      const full = await gmail.users.drafts.get({
        userId: "me",
        id: draft.id,
        format: "metadata",
      });

      const headers =
        full.data.message?.payload?.headers || [];

      results.push({
        draftId: draft.id,
        messageId: full.data.message?.id,
        threadId: full.data.message?.threadId,
        to: getHeader(headers, "To"),
        subject: getHeader(headers, "Subject"),
      });
    }

    return results;

  });
}

export async function sendDraft(draftId) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.drafts.send({
      userId: "me",

      requestBody: {
        id: draftId,
      },
    });

    return {
      id: response.data.id,
      threadId: response.data.threadId,
      sent: true,
    };

  });
}

export async function createReplyDraft({
  messageId,
  body,
}) {
  return gmailCall(async (gmail) => {

    const original = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: [
        "From",
        "To",
        "Subject",
        "Message-ID",
        "References",
      ],
    });

    const headers =
      original.data.payload?.headers || [];

    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const originalMessageId =
      getHeader(headers, "Message-ID");

    const references = [
      getHeader(headers, "References"),
      originalMessageId,
    ]
      .filter(Boolean)
      .join(" ");

    const replySubject =
      /^re:/i.test(subject)
        ? subject
        : `Re: ${subject}`;

    return createDraft({
      to: from,
      subject: replySubject,
      body,
      threadId: original.data.threadId,
      inReplyTo: originalMessageId,
      references,
    });

  });
}

export async function markEmailRead(messageId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,

      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });

    return {
      messageId,
      read: true,
    };

  });
}

export async function markEmailUnread(messageId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,

      requestBody: {
        addLabelIds: ["UNREAD"],
      },
    });

    return {
      messageId,
      unread: true,
    };

  });
}

export async function archiveEmail(messageId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,

      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });

    return {
      messageId,
      archived: true,
    };

  });
}

export async function trashEmail(messageId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    });

    return {
      messageId,
      trashed: true,
    };

  });
}


// ======================================================
// LABELS
// ======================================================

export async function listLabels() {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.labels.list({
      userId: "me",
    });

    const labels = response.data.labels || [];

    return labels.map(label => ({
      id: label.id,
      name: label.name,
      type: label.type,
    }));

  });
}


export async function addLabelToEmail(messageId, labelId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,

      requestBody: {
        addLabelIds: [labelId],
      },
    });

    return {
      messageId,
      labelId,
      added: true,
    };

  });
}


export async function removeLabelFromEmail(messageId, labelId) {
  return gmailCall(async (gmail) => {

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,

      requestBody: {
        removeLabelIds: [labelId],
      },
    });

    return {
      messageId,
      labelId,
      removed: true,
    };

  });
}


// ======================================================
// FORWARD
// ======================================================

export async function forwardEmail({
  messageId,
  to,
}) {
  return gmailCall(async (gmail) => {

    const original = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: [
        "From",
        "Subject",
        "Message-ID",
        "References",
      ],
    });

    const headers =
      original.data.payload?.headers || [];

    const subject = getHeader(headers, "Subject");
    const originalMessageId =
      getHeader(headers, "Message-ID");

    const references = [
      getHeader(headers, "References"),
      originalMessageId,
    ]
      .filter(Boolean)
      .join(" ");

    const fwdSubject =
      /^fwd?:/i.test(subject)
        ? subject
        : `Fwd: ${subject}`;

    const raw = encodeMessage({
      to,
      subject: fwdSubject,
      body: "",
      inReplyTo: originalMessageId,
      references,
    });

    const response = await gmail.users.messages.send({
      userId: "me",

      requestBody: {
        raw,
      },
    });

    return {
      id: response.data.id,
      threadId: response.data.threadId,
      forwarded: true,
      to,
    };

  });
}


// ======================================================
// BATCH OPERATIONS
// ======================================================

export async function batchMarkRead(messageIds) {
  return gmailCall(async (gmail) => {

    for (const id of messageIds) {
      await gmail.users.messages.modify({
        userId: "me",
        id,

        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    }

    return {
      messageIds,
      count: messageIds.length,
      read: true,
    };

  });
}


export async function batchArchive(messageIds) {
  return gmailCall(async (gmail) => {

    for (const id of messageIds) {
      await gmail.users.messages.modify({
        userId: "me",
        id,

        requestBody: {
          removeLabelIds: ["INBOX"],
        },
      });
    }

    return {
      messageIds,
      count: messageIds.length,
      archived: true,
    };

  });
}


export async function batchTrash(messageIds) {
  return gmailCall(async (gmail) => {

    for (const id of messageIds) {
      await gmail.users.messages.trash({
        userId: "me",
        id,
      });
    }

    return {
      messageIds,
      count: messageIds.length,
      trashed: true,
    };

  });
}


// ======================================================
// PIÈCES JOINTES
// ======================================================

function listAttachments(payload, prefix = "") {
  const results = [];

  function walk(part, path) {
    if (!part) return;

    if (part.filename && part.body?.attachmentId) {
      results.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        path,
      });
    }

    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child, path ? `${path}/${child.filename || "part"}` : child.filename || "part");
      }
    }
  }

  walk(payload, prefix);
  return results;
}


export async function getEmailAttachments(messageId) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const attachments =
      listAttachments(response.data.payload);

    return {
      messageId,
      count: attachments.length,
      attachments,
    };

  });
}


export async function downloadAttachment({
  messageId,
  attachmentId,
}) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.messages.attachments.get({
      userId: "me",
      id: attachmentId,
      messageId,
    });

    const data = response.data.data || "";

    const decoded = Buffer.from(data, "base64");

    return {
      messageId,
      attachmentId,
      size: decoded.length,
      data,
    };

  });
}


// ======================================================
// THREADS
// ======================================================

export async function listThreads({
  maxResults = 10,
  query = "",
  pageToken = undefined,
} = {}) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.threads.list({
      userId: "me",
      maxResults,
      q: query || undefined,
      pageToken: pageToken || undefined,
    });

    const threads = response.data.threads || [];
    const nextPageToken = response.data.nextPageToken ?? null;

    return {
      threads: threads.map(t => ({
        id: t.id,
        snippet: t.snippet,
        messagesCount: t.messages?.length ?? 0,
      })),
      nextPageToken,
    };

  });
}


export async function readThread(threadId) {
  return gmailCall(async (gmail) => {

    const response = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const thread = response.data;
    const messages = thread.messages || [];

    return {
      id: thread.id,
      subject: getHeader(
        messages[0]?.payload?.headers || [],
        "Subject"
      ),
      messagesCount: messages.length,
      messages: messages.map(msg => {
        const headers = msg.payload?.headers || [];
        const bodies = extractBodies(msg.payload);

        let body = bodies.plain;
        if (!body && bodies.html) {
          body = bodies.html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();
        }

        return {
          id: msg.id,
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          date: getHeader(headers, "Date"),
          body,
        };
      }),
    };

  });
}