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

import {
  changeDeviceState,
  getDeviceId,
  getDeviceState,
  setCountdown
} from "./home_automation.js"
import { wake_on_lan_nas, listSharedFoldersNas, listNasFoldersNas } from "./nas.js";

export const nativeTools = [
  timeTool,
  webSearchTool,
  weatherTool,

  transitTool,
  disruptionsTool,
  drivingTool,

  ...gmailTools,

  changeDeviceState,
  getDeviceId,
  getDeviceState,
  setCountdown,

  wake_on_lan_nas,
  listSharedFoldersNas,
  listNasFoldersNas
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