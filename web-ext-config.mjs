import { createRequire } from "module";

// This config needs to be an ES module. web-ext loads it with `import()`, and on
// newer Node versions importing a `.cjs` file also exposes a `module.exports`
// named export, which web-ext then rejects: `The config option "module.exports"
// must be specified in camel case`. Reading project.config.ts still needs a
// CommonJS `require` (so the sucrase-node hook kicks in), hence createRequire.
const require = createRequire(import.meta.url);

const optionalRequire = require("optional-require")(require);

const config = require("./project.config").default;

const customConfig = optionalRequire("./custom.config.cjs") || {};

export default {
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
