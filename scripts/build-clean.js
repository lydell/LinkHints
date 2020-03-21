// @flow strict-local

import fs from "fs";
import path from "path";

import config from "../project.config";

const BASE_DIR = path.join(__dirname, "..");
const DIST = path.join(BASE_DIR, config.dist);
const FILE_EXTENSIONS_TO_REMOVE: Set<string> = new Set([
  ".zip",
  ".xpi",
  ".crx",
]);

function run() {
  if (!fs.existsSync(DIST)) {
    console.log("No directory to clean for BROWSER:", config.browser);
    return;
  }

  const itemsToRemove = fs
    .readdirSync(DIST)
    .filter((item) => FILE_EXTENSIONS_TO_REMOVE.has(path.extname(item)))
    .map((item) => path.join(DIST, item));

  if (itemsToRemove.length === 0) {
    console.log("No files to clean for BROWSER:", config.browser);
    return;
  }

  for (const item of itemsToRemove) {
    console.log("Removing:", item);
    fs.unlinkSync(item);
  }
}

run();
