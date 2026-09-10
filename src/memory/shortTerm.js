const MAX_MESSAGES = 12;

let history = [];


export function addUserMessage(
  text,
  files = []
) {

  const parts = [];

  if (text) {
    parts.push({
      text
    });
  }

  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.mimeType,
        data: file.data,
      },
    });
  }

  if (!parts.length) {
    parts.push({ text: "" });
  }

  history.push({
    role: "user",
    parts,
  });

  trimHistory();
}


export function addAssistantMessage(
  text
) {

  history.push({
    role: "model",

    parts: [
      {
        text
      }
    ]
  });


  trimHistory();
}


export function getHistory() {

  return [
    ...history
  ];
}


export function clearHistory() {

  history = [];
}


function trimHistory() {

  if (
    history.length >
    MAX_MESSAGES
  ) {

    history =
      history.slice(
        -MAX_MESSAGES
      );
  }
}