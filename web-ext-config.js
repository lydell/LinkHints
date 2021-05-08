const optionalRequire = require("optional-require")(require);

const config = require("./project.config").default;

const customConfig = optionalRequire("./custom.config") || {};

module.exports = {
  sourceDir: config.compiled,
  artifactsDir: config.dist,
  ignoreFiles: config.webextIgnoreFiles,
  build: {
    overwriteDest: true,
  },
  lint: {
    warningsAsErrors: true,
  },
  run: customConfig.run || {},
  sign: customConfig.sign || {},
};
