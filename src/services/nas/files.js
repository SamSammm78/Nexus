import {
  nasRequest,
} from "./client.js";

export async function listSharedFolders() {
  return nasRequest({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list_share",
  });
}

export async function listNasFolder(folderPath) {
  return nasRequest({
    api: "SYNO.FileStation.List",
    version: "2",
    method: "list",

    params: {
      folder_path: folderPath,

      additional: JSON.stringify([
        "real_path",
        "size",
        "owner",
        "time",
        "perm",
      ]),
    },
  });
}


