import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import sucrase from "@rollup/plugin-sucrase";
import fs from "fs";
import fsExtra from "fs-extra";
import optionalRequireImport from "optional-require";
import path from "path";
import prettier from "rollup-plugin-prettier";
// eslint-disable-next-line import/no-extraneous-dependencies
import register from "sucrase/dist/register";

const jsx = {
  jsxPragma: "h",
  jsxFragmentPragma: "Fragment",
};

register.addHook(".ts", {
  transforms: ["typescript", "imports"],
});

register.addHook(".tsx", {
  transforms: ["typescript", "jsx", "imports"],
  ...jsx,
});

const transformCSS = require("./src/css").default;
const config = require("./project.config").default;

const optionalRequire = optionalRequireImport(require);
const customConfig = optionalRequire("./custom.config") || {};

const PROD = config.prod;

const { DEFAULT_LOG_LEVEL = "log", DEFAULT_STORAGE_SYNC = null } = PROD
  ? {}
  : customConfig;

setup();

const main = [
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
  css(config.popupCss),
  html({
    title: `${config.meta.name} Options`,
    html: config.optionsHtml,
    // Content scripts don’t run in the options page, so manually include them.
    js: [config.worker.output, config.renderer.output, config.options.output],
    css: [config.optionsCss.output],
  }),
  css(config.optionsCss),
  config.needsPolyfill ? copy(config.polyfill) : undefined,
]
  .filter(Boolean)
  .map((entry) => ({
    ...entry,
    input: `${config.src}/${entry.input}`,
    output: {
      ...entry.output,
      file: `${config.compiled}/${entry.output.file}`,
      indent: false,
    },
  }));

const docs = [
  css(config.docs.sharedCss),
  template(config.docs.index),
  css(config.docs.indexCss),
  template(config.docs.tutorial),
  css(config.docs.tutorialCss),
]
  .filter(Boolean)
  .map((entry) => ({
    ...entry,
    input: `${config.docs.src}/${entry.input}`,
    output: {
      ...entry.output,
      file: `${config.docs.compiled}/${entry.output.file}`,
      indent: false,
    },
  }));

module.exports = main.concat(docs);

function setup() {
  console.time("setup");

  fsExtra.removeSync(config.compiled);
  fsExtra.removeSync(config.docs.compiled);

  fsExtra.copySync(
    `${config.src}/${config.iconsDir}`,
    `${config.compiled}/${config.iconsDir}`
  );
  fsExtra.copySync(
    `${config.docs.src}/${config.docs.iconsDir}`,
    `${config.docs.compiled}/${config.docs.iconsDir}`
  );

  console.timeEnd("setup");
}

function js({ input, output } /*: { input: string, output: string } */) {
  return {
    input,
    output: {
      file: output,
      format: "iife",
      sourcemap: !PROD,
      externalLiveBindings: false,
    },
    plugins: [
      replace({ ...makeGlobals(), preventAssignment: false }),
      sucrase({
        exclude: ["node_modules/**"],
        transforms: ["typescript", "jsx"],
        // Don't add `__self` and `__source` to JSX, which Preact does not support.
        production: true,
        ...jsx,
      }),
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
//     export default data => compile(data)
//
// The function must return a string, and may optionally use `data`. Whatever
// string is returned will end up in `output`.
function template(
  {
    input,
    output,
    data,
  } /*: {
    input: string,
    output: string,
    data?: mixed,
  } */
) {
  let content = undefined;
  return {
    input,
    output: {
      file: output,
      format: "es",
    },
    treeshake: false,
    external: (id) => !id.startsWith("."),
    plugins: [
      sucrase({
        transforms: ["typescript", "jsx"],
        production: true,
        ...jsx,
      }),
      resolve(),
      commonjs(),
      {
        name: "template",
        load: (id /*: string */) => {
          if (content == null) {
            const dir = path.dirname(id);
            for (const key of Object.keys(require.cache)) {
              if (key.startsWith(dir)) {
                delete require.cache[key];
              }
            }
            content = require(id).default(data);
          }
          return null;
        },
        renderChunk: () => {
          const chunk = { code: content, map: undefined };
          content = undefined;
          return chunk;
        },
      },
    ],
  };
}

function html(
  files /*: {
    title: string,
    html: string,
    js: Array<string>,
    css: Array<string>,
  } */
) {
  return template({
    input: "html.tsx",
    output: files.html,
    data: {
      title: files.title,
      polyfill: config.needsPolyfill
        ? path.relative(path.dirname(files.html), config.polyfill.output)
        : undefined,
      js: files.js.map((src) => path.relative(path.dirname(files.html), src)),
      css: files.css.map((href) =>
        path.relative(path.dirname(files.html), href)
      ),
    },
  });
}

function copy(
  { input, output } /*: { input: string, output: string, } */,
  transform /*: string => string */ = (string) => string
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
        name: "copy",
        load: (id /*: string */) => {
          content = transform(fs.readFileSync(id, "utf8"));
          return "0";
        },
        renderChunk: () => ({ code: content, map: undefined }),
      },
    ],
  };
}

function css({ input, output } /*: { input: string, output: string, } */) {
  return copy({ input, output }, transformCSS);
}

function makeGlobals() {
  return {
    BROWSER:
      config.browser == null
        ? `(navigator.userAgent.includes("Firefox") ? "firefox" : "chrome")`
        : JSON.stringify(config.browser),
    // Note: BUILD_ID might vary between different files.
    BUILD_ID: JSON.stringify(
      PROD ? config.meta.version.replace(/\W/g, "_") : Date.now().toString()
    ),
    COLOR_BADGE: JSON.stringify(config.colors.badge),
    COLOR_GREEN: JSON.stringify(config.colors.green),
    COLOR_PURPLE: JSON.stringify(config.colors.purple),
    COLOR_YELLOW: JSON.stringify(config.colors.yellow),
    DEFAULT_LOG_LEVEL_CONFIG: JSON.stringify(DEFAULT_LOG_LEVEL),
    DEFAULT_STORAGE_SYNC: JSON.stringify(DEFAULT_STORAGE_SYNC),
    META_HOMEPAGE: JSON.stringify(config.meta.homepage),
    META_ICON: JSON.stringify(config.meta.icon),
    META_NAME: JSON.stringify(config.meta.name),
    META_SLUG: JSON.stringify(config.meta.slug),
    META_TUTORIAL: JSON.stringify(config.meta.tutorial),
    META_VERSION: JSON.stringify(config.meta.version),
    PROD: JSON.stringify(PROD),
    // Performance. Note: These require `x != null` in `x instanceof A`.
    "instanceof Text": ".nodeType === 3",
    "instanceof HTMLAnchorElement": '.nodeName === "A"',
    "instanceof HTMLInputElement": '.nodeName === "INPUT"',
    // Silence the “Unsafe assignment to innerHTML” warning from `web-ext lint`.
    // This piece of code comes from Preact. Note that this disables the
    // `dangerouslySetInnerHTML` feature.
    "n.innerHTML": "n.__disabled__innerHTML",
    // Hacks to make `preact-shadow-root` work with Preact 10.
    "this.base&&this.base.parentNode": "this.__P",
    "o.children[0],": "o.children,",
    "this.shadow.firstChild": "undefined",
  };
}
