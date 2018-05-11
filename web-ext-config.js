// @flow

const config = require("./project.config");

let applyCustomConfig = webExtConfig => webExtConfig;
try {
  // $FlowIgnore: This file is intentionally ignored.
  applyCustomConfig = require("./web-ext-config.custom"); // eslint-disable-line import/no-unresolved
} catch (error) {
  // Do nothing.
}

module.exports = applyCustomConfig({
  sourceDir: config.src,
  artifactsDir:
    config.browser == null ? config.dist : `${config.dist}-${config.browser}`,
  build: {
    overwriteDest: true,
  },
  ignoreFiles: config.webextIgnoreFiles,
});
