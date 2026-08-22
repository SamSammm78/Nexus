import {
  timeTool,
} from "./time.js";

import {
  webSearchTool,
} from "./webSearch.js";

import {
  weatherTool,
} from "./weather.js";

import {
  transitTool,
  disruptionsTool,
  drivingTool,
} from "./navigation/index.js";

import {
  gmailTools,
} from "./google/gmail.js";


export const nativeTools = [
  timeTool,
  webSearchTool,
  weatherTool,

  transitTool,
  disruptionsTool,
  drivingTool,

  ...gmailTools,
];


export function getNativeDeclarations() {

  return nativeTools.map(
    tool =>
      tool.declaration
  );
}


export function getNativeDeclaration(
  name
) {

  const tool =
    nativeTools.find(
      tool =>
        tool.declaration.name ===
        name
    );

  return (
    tool?.declaration ??
    null
  );
}


export async function executeNativeTool(
  name,
  args = {}
) {

  const tool =
    nativeTools.find(
      tool =>
        tool.declaration.name ===
        name
    );

  if (
    !tool
  ) {

    throw new Error(
      `Outil natif inconnu : ${name}`
    );
  }

  return await tool.execute(
    args
  );
}