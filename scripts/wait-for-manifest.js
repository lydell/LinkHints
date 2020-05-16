// @flow strict-local

import fs from "fs";
import path from "path";

import config from "../project.config";

const BASE_DIR = path.join(__dirname, "..");
const MANIFEST = path.join(BASE_DIR, config.compiled, config.manifest.output);
const MANIFEST_SRC = path.join(BASE_DIR, config.src, config.manifest.input);

const SLEEP_MS = 200;

function poll() {
  if (fs.existsSync(MANIFEST)) {
    process.exit(0);
  }
  console.log(
    `${MANIFEST} does not exist yet. Checking again in ${SLEEP_MS}ms.`
  );
  setTimeout(poll, SLEEP_MS);
}

// If starting the watcher and a browser at the same time, make sure that the
// browser won’t start until the watcher has compiled once:
if (fs.existsSync(MANIFEST)) {
  fs.unlinkSync(MANIFEST);
}

// If the watcher is already running, make sure that it recreates the manifest.
const now = Date.now();
fs.utimesSync(MANIFEST_SRC, now, now);

poll();
