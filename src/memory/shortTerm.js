const MAX_MESSAGES = 12;

let history = [];


export function addUserMessage(
  text
) {

  history.push({
    role: "user",

    parts: [
      {
        text
      }
    ]
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