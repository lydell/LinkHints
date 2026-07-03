import { createRequire } from "module";

/** @typedef {"chrome" | "firefox"} Browser */

const requireFromProject = createRequire(`${process.cwd()}/package.json`);
const optionalRequire =
  requireFromProject("optional-require")(requireFromProject);

const customConfig = optionalRequire("./custom.config.cjs") || {};

const browser = getBrowser();

export default {
  sourceDir: "compiled",
  artifactsDir: browser === undefined ? "dist" : `dist-${browser}`,
  ignoreFiles: ["icons/*.!(svg)", ...browserSpecificIgnores(browser)],
  build: {
    overwriteDest: true,
  },
  lint: {
    warningsAsErrors: true,
  },
  run: customConfig.run || {},
  sign: customConfig.sign || {},
};

/** @returns {Browser | undefined} */
function getBrowser() {
  switch (process.env.BROWSER) {
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    default:
      return undefined;
  }
}

/**
 * @param {Browser | undefined} browser
 * @returns {Array<string>}
 */
function browserSpecificIgnores(browser) {
  switch (browser) {
    case "chrome":
      return ["icons/svg-*"];
    case "firefox":
      return ["icons/png-*"];
    case undefined:
      return [];
  }
}
