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
      globals: {
        BROWSER: false,
        BUILD_TIME: false,
        CLICKABLE_EVENT_NAMES: false,
        CustomEvent: false,
        EventTarget: false,
        HTMLAnchorElement: false,
        HTMLElement: false,
        HTMLFrameElement: false,
        HTMLIFrameElement: false,
        HTMLInputElement: false,
        HTMLSelectElement: false,
        HTMLTextAreaElement: false,
        INJECTED_CLICKABLE_EVENT: false,
        INJECTED_UNCLICKABLE_EVENT: false,
        INJECTED_RESET: false,
        IntersectionObserver: false,
        MutationObserver: false,
        PROD: false,
        Text: false,
        browser: false,
        clearTimeout: false,
        console: false,
        document: false,
        performance: false,
        setTimeout: false,
        window: false,
      },
    },
  ],
};
