// @flow strict-local

const fs = require("fs");
const path = require("path");

const fsExtra = require("fs-extra");
const optionalRequire = require("optional-require")(require);
const commonjs = require("rollup-plugin-commonjs");
const prettier = require("rollup-plugin-prettier");
const replace = require("rollup-plugin-replace");
const resolve = require("rollup-plugin-node-resolve");
const sucrase = require("rollup-plugin-sucrase");

const config = require("./project.config");

const customConfig = optionalRequire("./custom.config") || {};

const PROD = config.browser != null;

const { DEFAULT_LOG_LEVEL = "log", DEFAULT_STORAGE_SYNC = null } = PROD
  ? {}
  : customConfig;

setup();

// $FlowIgnore: Flow wants a type annotation here, but that’s just annoying.
module.exports = [
  js(config.background),
  js(config.worker),
  js(config.renderer),
  js(config.popup),
  js(config.options),
  template(config.manifest),
  template(config.iconsCompilation),
  html({
    title: `${config.meta.name} Popup`,
    html: config.popupHtml,
    js: [config.popup.output],
    css: [config.popupCss.output],
  }),
  copy(config.popupCss),
  html({
    title: `${config.meta.name} Options`,
    html: config.optionsHtml,
    // Content scripts don’t run in the options page, so manually include them.
    js: [config.worker.output, config.renderer.output, config.options.output],
    css: [config.optionsCss.output],
  }),
  copy(config.optionsCss),
  config.needsPolyfill ? copy(config.polyfill) : undefined,
]
  .filter(Boolean)
  .map(entry => ({
    ...entry,
    input: `${config.src}/${entry.input}`,
    output: {
      ...entry.output,
      file: `${config.compiled}/${entry.output.file}`,
      indent: false,
    },
  }));

function setup() {
  console.time("setup");
  fsExtra.removeSync(config.compiled);
  fsExtra.copySync(
    `${config.src}/${config.iconsDir}`,
    `${config.compiled}/${config.iconsDir}`
  );
  console.timeEnd("setup");
}

function js({ input, output } /*: {| input: string, output: string |} */) {
  return {
    input,
    output: {
      file: output,
      format: "iife",
      sourcemap: !PROD,
    },
    plugins: [
      sucrase({
        exclude: ["node_modules/**"],
        transforms: ["flow", "jsx"],
        // Don't add `__self` and `__source` to JSX, which Preact does not support.
        production: true,
      }),
      replace(makeGlobals()),
      resolve(),
      commonjs(),
      PROD ? prettier({ parser: "babel" }) : undefined,
    ].filter(Boolean),
    onwarn: (warning /*: mixed */) => {
      throw warning;
    },
  };
}

// `input` must be a JavaScript file containing:
//
//     module.exports = data => compile(data)
//
// The function must return a string, and may optionally use `data`. Whatever
// string is returned will end up in `output`.
function template(
  {
    input,
    output,
    data,
  } /*: {|
    input: string,
    output: string,
    data?: mixed,
  |} */
) {
  let content = "";
  return {
    input,
    output: {
      file: output,
      format: "es",
    },
    treeshake: false,
    plugins: [
      {
        name: "template",
        load: (id /*: string */) => {
          delete require.cache[id];
          content = require(id)(data);
          return "0";
        },
        renderChunk: () => ({ code: content, map: undefined }),
      },
    ],
  };
}

function html(
  files /*: {|
    title: string,
    html: string,
    js: Array<string>,
    css: Array<string>,
  |} */
) {
  return template({
    input: "html.js",
    output: files.html,
    data: {
      title: files.title,
      polyfill: config.needsPolyfill
        ? path.relative(path.dirname(files.html), config.polyfill.output)
        : undefined,
      js: files.js.map(src => path.relative(path.dirname(files.html), src)),
      css: files.css.map(href => path.relative(path.dirname(files.html), href)),
    },
  });
}

function copy({ input, output } /*: {| input: string, output: string, |} */) {
  let content = "";
  return {
    input,
    output: {
      file: output,
      format: "es",
    },
    treeshake: false,
    plugins: [
      {
        name: "copy",
        load: (id /*: string */) => {
          content = fs.readFileSync(id, "utf8");
          return "0";
        },
        renderChunk: () => ({ code: content, map: undefined }),
      },
    ],
  };
}

function makeGlobals() {
  return {
    BROWSER:
      config.browser == null
        ? `(navigator.userAgent.includes("Firefox") ? "firefox" : "chrome")`
        : JSON.stringify(config.browser),
    // Note: BUILD_ID might vary between different files.
    BUILD_ID: JSON.stringify(
      PROD ? config.meta.version.replace(/\W/g, "_") : String(Date.now())
    ),
    DEFAULT_LOG_LEVEL_CONFIG: JSON.stringify(DEFAULT_LOG_LEVEL),
    DEFAULT_STORAGE_SYNC: JSON.stringify(DEFAULT_STORAGE_SYNC),
    META_HOMEPAGE: JSON.stringify(config.meta.homepage),
    META_ICON: JSON.stringify(config.meta.icon),
    META_NAME: JSON.stringify(config.meta.name),
    META_SLUG: JSON.stringify(config.meta.slug),
    META_TUTORIAL: JSON.stringify(config.meta.tutorial),
    META_VERSION: JSON.stringify(config.meta.version),
    PROD: JSON.stringify(PROD),
    // Silence the “Unsafe assignment to innerHTML” warning from `web-ext lint`.
    // This piece of code comes from Preact. Note that this disables the
    // `dangerouslySetInnerHTML` feature.
    "node.innerHTML": "node.__disabled__innerHTML",
  };
}
