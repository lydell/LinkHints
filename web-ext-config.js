// @flow strict-local

const optionalRequire = require("optional-require")(require);

const config = require("./project.config");

const customConfig = optionalRequire("./custom.config") || {};

const {
  webExt: applyCustomConfig = webExtConfig => webExtConfig,
} = customConfig;

module.exports = applyCustomConfig({
  sourceDir: config.src,
  artifactsDir: config.dist,
  build: {
    overwriteDest: true,
  },
  ignoreFiles: config.webextIgnoreFiles,
});
