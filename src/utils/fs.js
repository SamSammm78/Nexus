import {
  statSync,
} from "node:fs";


export function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}