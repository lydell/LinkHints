const baseRules = require("eslint-config-lydell");

module.exports = {
  parser: "babel-eslint",
  plugins: [
    "flowtype",
    "flowtype-errors",
    "import",
    "prettier",
    "sort-imports-es6-autofix",
  ],
  env: {
    es6: true,
    node: true,
  },
  rules: Object.assign({}, baseRules({ flow: true, import: true }), {
    "flowtype-errors/show-errors": "error",
    "func-style": "off",
    "no-console": "error",
    "no-script-url": "off",
    "prettier/prettier": "error",
    "require-await": "error",
    "sort-imports-es6-autofix/sort-imports-es6": "error",
    "spaced-comment": [
      "error",
      "always",
      {
        block: {
          markers: [":", "::"],
          balanced: true,
        },
      },
    ],
  }),
  overrides: [
    {
      files: [".*.js", "*.config.js", "web-ext-*.js"],
      rules: {
        "flowtype/require-parameter-type": "off",
        "flowtype/require-return-type": "off",
        "flowtype/require-valid-file-annotation": "off",
      },
    },
    {
      files: ["src/*/**/*.js", "html/**/*.js"],
      env: {
        es6: true,
        node: false,
      },
      globals: Object.assign({}, baseRules.browserEnv(), {
        BROWSER: true,
        BUILD_TIME: false,
        CLICKABLE_EVENT_NAMES: false,
        INJECTED_CLICKABLE_EVENT: false,
        INJECTED_UNCLICKABLE_EVENT: false,
        INJECTED_QUEUE_EVENT: false,
        INJECTED_VAR: false,
        PROD: false,
        browser: false,
      }),
    },
  ],
};
