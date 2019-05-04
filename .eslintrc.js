const baseRules = require("eslint-config-lydell");

// The Prettier and Flow plugins are disabled (at least for now) because of
// performance issues. You need to run them separately.

module.exports = {
  root: true,
  parser: "babel-eslint",
  plugins: [
    "babel",
    "flowtype",
    // "flowtype-errors",
    "import",
    // "prettier",
    "react",
    "react-hooks",
    "simple-import-sort",
  ],
  env: {
    es6: true,
    node: true,
  },
  rules: Object.assign(
    {},
    baseRules({ flow: true, import: true, react: true }),
    {
      "babel/no-invalid-this": "error",
      // "flowtype-errors/show-errors": "error",
      "import/no-restricted-paths": [
        "error",
        {
          basePath: "src",
          // Disallow these dirs from importing from each other.
          zones: makeRestrictedPathsZones([
            "background",
            "options",
            "popup",
            "renderer",
            "worker",
          ]),
        },
      ],
      "no-console": "error",
      "no-invalid-this": "off",
      "no-script-url": "off",
      // "prettier/prettier": "error",
      "require-await": "error",
      "react/require-default-props": "off",
    }
  ),
  overrides: [
    {
      files: [".*.js", "*.config.js", "web-ext-*.js"],
      rules: {
        "flowtype/require-parameter-type": "off",
        "flowtype/require-return-type": "off",
        "flowtype/require-valid-file-annotation": "off",
        "import/order": ["error", { "newlines-between": "always" }],
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
        BUILD_TIME: true,
        PROD: false,
        browser: false,
      }),
      rules: {
        "simple-import-sort/sort": "error",
      },
    },
  ],
  settings: {
    react: {
      version: "16",
      flowVersion: "detect",
    },
  },
};

function makeRestrictedPathsZones(dirs) {
  return [].concat(
    ...dirs.map(dir => {
      const otherDirs = dirs.filter(dir2 => dir2 !== dir);
      return otherDirs.map(dir2 => ({ target: dir, from: dir2 }));
    }),
    ...dirs.map(dir => ({ target: "shared", from: dir }))
  );
}
