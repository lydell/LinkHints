const baseRules = require("eslint-config-lydell");

module.exports = {
  root: true,
  parser: "babel-eslint",
  plugins: [
    "babel",
    "flowtype",
    "import",
    "prettier",
    "react",
    "react-hooks",
    "simple-import-sort",
  ],
  env: {
    es6: true,
    node: true,
  },
  rules: {
    ...baseRules({ flow: true, import: true, react: true }),
    "babel/no-invalid-this": "error",
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
    "no-invalid-this": "off",
    "no-script-url": "off",
    "prettier/prettier": "error",
    "react/require-default-props": "off",
    "react/self-closing-comp": "error",
    "require-await": "error",
    "simple-import-sort/sort": "error",
  },
  overrides: [
    {
      files: [".*.js", "*.config.js", "web-ext-*.js", "scripts/*.js"],
      rules: {
        "flowtype/require-parameter-type": "off",
        "flowtype/require-return-type": "off",
        "flowtype/require-valid-file-annotation": "off",
      },
    },
    {
      files: ["src/*/**/*.js"],
      env: {
        es6: true,
        node: false,
      },
      globals: {
        ...baseRules.browserEnv(),
        BROWSER: false,
        browser: false,
        BUILD_ID: false,
        COLOR_BADGE: false,
        COLOR_GREEN: false,
        COLOR_PURPLE: false,
        COLOR_YELLOW: false,
        DEFAULT_LOG_LEVEL_CONFIG: false,
        DEFAULT_STORAGE_SYNC: false,
        exportFunction: false,
        META_HOMEPAGE: false,
        META_ICON: false,
        META_NAME: false,
        META_SLUG: false,
        META_TUTORIAL: false,
        META_VERSION: false,
        navigator: false,
        PROD: false,
      },
      rules: {
        "no-console": "error",
      },
    },
    {
      files: ["*.es5.js"],
      parser: "espree",
      parserOptions: { ecmaVersion: 5 },
      env: {
        es6: false,
        node: false,
      },
      globals: baseRules.browserEnv(),
      rules: {
        "flowtype/require-parameter-type": "off",
        "no-implicit-globals": "off",
        "no-var": "off",
        "object-shorthand": "off",
        "prefer-const": "off",
        "prefer-destructuring": "off",
        "prefer-rest-params": "off",
        "prefer-spread": "off",
        "prefer-template": "off",
        strict: "off",
      },
    },
    {
      files: ["html/**/*.js"],
      env: {
        es6: true,
        node: false,
      },
      globals: baseRules.browserEnv(),
      rules: {
        "flowtype/require-parameter-type": "off",
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
