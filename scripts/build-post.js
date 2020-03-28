// @flow strict-local

import spawn from "cross-spawn";
import crx3 from "crx3";
import fs from "fs";
import path from "path";
import readdirp from "readdirp";
import { ZipFile } from "yazl";

import config from "../project.config";

const BASE_DIR = path.join(__dirname, "..");
const DIST = path.join(BASE_DIR, config.dist);
const DIST_FILE_BASE = path.join(DIST, config.meta.webExtBaseName);
const ZIP_FILE = `${DIST_FILE_BASE}.zip`;
const XPI_FILE = `${DIST_FILE_BASE}.xpi`;
const CRX_FILE = `${DIST_FILE_BASE}.crx`;
const KEY_FILE = path.join(DIST, "key.pem");
const SOURCE_CODE_FILE = path.join(DIST, "source.zip");

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
      await makeSourceCodeBundle();
      console.log("Created .xpi file:", relative(XPI_FILE));
      console.log("Created source code bundle:", relative(SOURCE_CODE_FILE));
      break;

    default:
      (config.browser: null | void); // eslint-disable-line no-unused-expressions
      throw new Error(
        `Invalid BROWSER environment variable: ${String(process.env.BROWSER)}`
      );
  }
}

function relative(filePath): string {
  return path.relative(BASE_DIR, filePath);
}

async function makeSourceCodeBundle() {
  const files = [
    ".eslintignore",
    ".eslintrc.js",
    ".flowconfig",
    ".prettierignore",
    ".prettierrc.json",
    "LICENSE",
    "package-lock.json",
    "package.json",
    "project.config.js",
    "rollup.config.js",
    "web-ext-config.js",
  ].map((file) => path.join(BASE_DIR, file));

  const dirs = ["docs", "flow-typed", "scripts", "src"];

  const asyncFiles = await Promise.all(
    dirs.map((dir) => getAllFilesInDir(dir))
  );
  const allFiles = files.concat(...asyncFiles);

  const zip = new ZipFile();

  zip.addBuffer(Buffer.from(makeSourceCodeReadme()), "README.md");

  for (const file of allFiles) {
    zip.addFile(file, path.relative(BASE_DIR, file));
  }

  zip.end();

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(SOURCE_CODE_FILE);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
    zip.on("error", reject);
    zip.outputStream.pipe(writeStream);
  });
}

function makeSourceCodeReadme() {
  return `
Steps to reproduce this build:

1. Install [Node.js] 12 with npm 6.
2. Run \`npm ci\`.
3. Run \`npm run build:firefox\`.
4. Output is now available in \`dist-firefox/\`.

Commit: ${getGitCommit()}

Repo: ${config.meta.repo}

[node.js]: https://nodejs.org/
  `.replace(/^ *\n| *$/g, "");
}

function getGitCommit(): string {
  const result = spawn.sync("git", ["rev-parse", "HEAD"], {
    encoding: "utf-8",
  });

  if (result.error != null) {
    throw result.error;
  }

  if (result.stderr !== "") {
    if (result.stderr.includes("not a git repository")) {
      return "(outside git repository)";
    }
    throw new Error(result.stderr);
  }

  return result.stdout.toString().trim();
}

async function getAllFilesInDir(dir: string): Promise<Array<string>> {
  const results = await readdirp.promise(dir);
  return results.map(({ fullPath }) => fullPath);
}

run().catch((error) => {
  console.error(
    "Failed to run post build operations. Remember to build first!"
  );
  console.error(error.message);
  process.exit(1);
});
