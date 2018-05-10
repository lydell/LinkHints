// @flow

const config = require("./project.config");

let applyCustomConfig = webExtConfig => webExtConfig;
try {
  // $FlowIgnore: This file is intentionally ignored.
  applyCustomConfig = require("./web-ext-config.custom.js"); // eslint-disable-line import/no-unresolved
} catch (error) {
  // Do nothing.
}

module.exports = applyCustomConfig({
  sourceDir: config.src,
  build: {
    overwriteDest: true,
  },
  ignoreFiles: config.webextIgnoreFiles,
});
