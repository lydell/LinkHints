// @flow strict-local

const path = require("path");
const fs = require("fs");

const crx3 = require("crx3");

const config = require("../project.config");

const BASE_DIR = path.join(__dirname, "..");
const DIST = path.join(BASE_DIR, config.dist);
const DIST_FILE_BASE = path.join(DIST, `link_hints-${config.meta.version}`);
const ZIP_FILE = `${DIST_FILE_BASE}.zip`;
const XPI_FILE = `${DIST_FILE_BASE}.xpi`;
const CRX_FILE = `${DIST_FILE_BASE}.crx`;
const KEY_FILE = path.join(DIST, "key.pem");

async function run() {
  switch (config.browser) {
    case "chrome":
      await crx3(fs.createReadStream(ZIP_FILE), {
        keyPath: KEY_FILE,
        crxPath: CRX_FILE,
      });
      console.log("Created .crx file:", relative(CRX_FILE));
      console.log("Using key:", relative(KEY_FILE));
      break;

    case "firefox":
      fs.copyFileSync(ZIP_FILE, XPI_FILE);
      console.log("Created .xpi file:", relative(XPI_FILE));
      break;

    default:
      (config.browser: null | void); // eslint-disable-line no-unused-expressions
      throw new Error(
        `Invalid BROWSER environment variable: ${String(process.env.BROWSER)}`
      );
  }
}

function relative(filePath) {
  return path.relative(BASE_DIR, filePath);
}

run().catch(error => {
  console.error(
    "Failed to run post build operations. Remember to build first!"
  );
  console.error(error.message);
  process.exit(1);
});
