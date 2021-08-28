import spawn from "cross-spawn";
import crx3 from "crx3";
import type { EventEmitter } from "events";
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

async function run(): Promise<void> {
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

    case undefined:
      throw new Error(
        `Invalid BROWSER environment variable: ${String(process.env.BROWSER)}`
      );
  }
}

function relative(filePath: string): string {
  return path.relative(BASE_DIR, filePath);
}

async function makeSourceCodeBundle(): Promise<void> {
  const files = [
    ".eslintignore",
    ".eslintrc.js",
    ".prettierignore",
    ".prettierrc.json",
    "LICENSE",
    "package-lock.json",
    "package.json",
    "project.config.ts",
    "rollup.config.js",
    "tsconfig.json",
    "web-ext-config.js",
  ].map((file) => path.join(BASE_DIR, file));

  const dirs = ["@types", "docs", "patches", "scripts", "src"];

  const asyncFiles = await Promise.all(
    dirs.map((dir) => getAllFilesInDir(dir))
  );
  const allFiles = files.concat(...asyncFiles);

  // `ZipFile` extends `EventEmitter`, but that’s missing in the type definition.
  const zip = new ZipFile() as EventEmitter & ZipFile;

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

function makeSourceCodeReadme(): string {
  return `
Steps to reproduce this build:

1. Install [Node.js] 16 with npm 7.
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

  // The type annotation says `.error` is optional, but it seems to be set to
  // `null` on success.
  if (result.error !== null && result.error !== undefined) {
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

run().catch((error: Error) => {
  console.error(
    "Failed to run post build operations. Remember to build first!"
  );
  console.error(error.message);
  process.exit(1);
});
