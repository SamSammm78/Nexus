import {
  google
} from "googleapis";

import {
  getGoogleAuth
} from "./auth.js";


async function getGmail() {
  const auth = await getGoogleAuth();

  return google.gmail({
    version: "v1",
    auth,
  });
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

async function getGmailClient() {

  const auth =
    await getGoogleAuth();

  return google.gmail({
    version:
      "v1",

    auth,
  });
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
    ?? null
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
} = {}) {

  const gmail =
    await getGmailClient();


  const response =
    await gmail.users
      .messages.list({

        userId:
          "me",

        maxResults,

        q:
          query || undefined,
      });


  const messages =
    response.data
      .messages
    ?? [];


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


  return emails;
}


// ======================================================
// RECHERCHE
// ======================================================

export async function searchEmails({
  query,
  maxResults = 10,
}) {

  if (!query) {

    throw new Error(
      "query est obligatoire."
    );
  }


  return getRecentEmails({
    maxResults,
    query,
  });
}


// ======================================================
// LECTURE D'UN MAIL
// ======================================================

export async function readEmail(messageId) {
  const gmail = await getGmail();

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = response.data;

  const headers =
    message.payload?.headers || [];

  const getHeader = (name) =>
    headers.find(
      h =>
        h.name.toLowerCase() ===
        name.toLowerCase()
    )?.value || "";

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

    from: getHeader("From"),
    to: getHeader("To"),
    subject: getHeader("Subject"),
    date: getHeader("Date"),

    body,
  };
}

export async function createDraft({
  to,
  subject,
  body,
  threadId = undefined,
  inReplyTo = undefined,
  references = undefined,
}) {
  const gmail = await getGmail();

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
}

export async function getDrafts({
  maxResults = 10,
} = {}) {
  const gmail = await getGmail();

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

    const getHeader = (name) =>
      headers.find(
        h => h.name.toLowerCase() === name.toLowerCase()
      )?.value || null;

    results.push({
      draftId: draft.id,
      messageId: full.data.message?.id,
      threadId: full.data.message?.threadId,
      to: getHeader("To"),
      subject: getHeader("Subject"),
    });
  }

  return results;
}

export async function sendDraft(draftId) {
  const gmail = await getGmail();

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
}

export async function createReplyDraft({
  messageId,
  body,
}) {
  const gmail = await getGmail();

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

  const getHeader = (name) =>
    headers.find(
      h => h.name.toLowerCase() === name.toLowerCase()
    )?.value || "";

  const from = getHeader("From");
  const subject = getHeader("Subject");
  const originalMessageId =
    getHeader("Message-ID");

  const references = [
    getHeader("References"),
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
}

export async function markEmailRead(messageId) {
  const gmail = await getGmail();

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
}

export async function markEmailUnread(messageId) {
  const gmail = await getGmail();

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
}

export async function archiveEmail(messageId) {
  const gmail = await getGmail();

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
}

export async function trashEmail(messageId) {
  const gmail = await getGmail();

  await gmail.users.messages.trash({
    userId: "me",
    id: messageId,
  });

  return {
    messageId,
    trashed: true,
  };
}