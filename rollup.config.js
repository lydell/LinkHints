import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import sucrase from "@rollup/plugin-sucrase";
import fs from "fs";
import optionalRequireImport from "optional-require";
import path from "path";
import prettier from "rollup-plugin-prettier";
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
const customConfig = optionalRequire("./custom.config.cjs") || {};

const PROD = config.prod;

/** @type {{ DEFAULT_LOG_LEVEL: string, DEFAULT_STORAGE_SYNC: unknown }} */
const { DEFAULT_LOG_LEVEL = "log", DEFAULT_STORAGE_SYNC = null } = PROD
  ? {}
  : customConfig;

setup();

const main = [
  js(config.background),
  js(config.worker),
  js(config.injected),
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
].flatMap((entry) => ({
  ...entry,
  input: `${config.src}/${entry.input}`,
  output:
    typeof entry.output === "object" && !Array.isArray(entry.output)
      ? {
          ...entry.output,
          file: `${config.compiled}/${entry.output.file}`,
          indent: false,
        }
      : entry.output,
}));

const docs = [
  css(config.docs.sharedCss),
  template(config.docs.index),
  css(config.docs.indexCss),
  template(config.docs.tutorial),
  css(config.docs.tutorialCss),
].map((entry) => ({
  ...entry,
  input: `${config.docs.src}/${entry.input}`,
  output:
    typeof entry.output === "object" && !Array.isArray(entry.output)
      ? {
          ...entry.output,
          file: `${config.docs.compiled}/${entry.output.file}`,
          indent: false,
        }
      : entry.output,
}));

/** * @type {Array<import("rollup").RollupOptions>} */
const all = main.concat(docs);
module.exports = all;

/**
 * @returns {void}
 */
function setup() {
  console.time("setup");

  fs.rmSync(config.compiled, { recursive: true, force: true });
  fs.rmSync(config.docs.compiled, { recursive: true, force: true });

  copyDir(
    `${config.src}/${config.iconsDir}`,
    `${config.compiled}/${config.iconsDir}`
  );
  copyDir(
    `${config.docs.src}/${config.docs.iconsDir}`,
    `${config.docs.compiled}/${config.docs.iconsDir}`
  );

  console.timeEnd("setup");
}

/**
 * @param {string} fromDir
 * @param {string} toDir
 * @returns {void}
 */
function copyDir(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const item of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (item.isFile()) {
      fs.copyFileSync(
        path.join(fromDir, item.name),
        path.join(toDir, item.name)
      );
    } else if (item.isDirectory()) {
      copyDir(path.join(fromDir, item.name), path.join(toDir, item.name));
    } else {
      throw new Error(`copyDir: Neither a file nor a directory: ${item.name}`);
    }
  }
}

/**
 * @param {{ input: string, output: string }} options
 * @returns {import("rollup").RollupOptions}
 */
function js({ input, output }) {
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
        disableESTransforms: true,
        // Don't add `__self` and `__source` to JSX, which Preact does not support.
        production: true,
        ...jsx,
      }),
      resolve(),
      commonjs(),
      PROD ? prettier({ parser: "babel" }) : undefined,
    ].filter((plugin) => plugin !== undefined),
    onwarn: (warning) => {
      // injected.ts is both imported for exports, and is also used as an entry
      // point. In the latter case we don’t want to expose any exports as a
      // global variable.
      if (warning.code !== "MISSING_NAME_OPTION_FOR_IIFE_EXPORT") {
        throw warning;
      }
    },
  };
}

/**
 * `input` must be a JavaScript file containing:
 *
 *     export default data => compile(data)
 *
 * The function must return a string, and may optionally use `data`. Whatever
 * string is returned will end up in `output`.
 *
 * @param {{ input: string, output: string, data?: unknown }} options
 * @returns {import("rollup").RollupOptions}
 */
function template({ input, output, data }) {
  /** @type {string | undefined} */
  let content = undefined;
  return {
    input,
    output: {
      file: output,
      format: "es",
    },
    treeshake: false,
    plugins: [
      sucrase({
        transforms: ["typescript", "jsx"],
        disableESTransforms: true,
        production: true,
        ...jsx,
      }),
      resolve(),
      commonjs(),
      {
        name: "template",
        load: (id) => {
          if (content === undefined) {
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
          const chunk = { code: content ?? "", map: undefined };
          content = undefined;
          return chunk;
        },
      },
    ],
  };
}

/**
 * @param {{
 *   title: string,
 *   html: string,
 *   js: Array<string>,
 *   css: Array<string>,
 * }} files
 * @returns {import("rollup").RollupOptions}
 */
function html(files) {
  return template({
    input: "html.tsx",
    output: files.html,
    data: {
      title: files.title,
      js: files.js.map((src) => path.relative(path.dirname(files.html), src)),
      css: files.css.map((href) =>
        path.relative(path.dirname(files.html), href)
      ),
    },
  });
}

/**
 * @param {{ input: string, output: string }} options
 * @param {(content: string) => string} [transform]
 * @returns {import("rollup").RollupOptions}
 */
function copy({ input, output }, transform = (content) => content) {
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
        load: (id) => {
          content = transform(fs.readFileSync(id, "utf8"));
          return "0";
        },
        renderChunk: () => ({ code: content, map: undefined }),
      },
    ],
  };
}

/**
 * @param {{ input: string, output: string }} options
 * @returns {import("rollup").RollupOptions}
 */
function css({ input, output }) {
  return copy({ input, output }, transformCSS);
}

/**
 * @returns {Record<string, string>}
 */
function makeGlobals() {
  return {
    BROWSER:
      config.browser === undefined
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
    // Performance.
    " instanceof Text": "?.nodeType === 3",
    " instanceof HTMLAnchorElement": '?.localName === "a"',
    " instanceof HTMLInputElement": '?.localName === "input"',
    // Silence the “Unsafe assignment to innerHTML” warning from `web-ext lint`.
    // This piece of code comes from Preact. Note that this disables the
    // `dangerouslySetInnerHTML` feature.
    "l.innerHTML": "l.__disabled__innerHTML",
    // Hacks to make `preact-shadow-root` work with Preact 10.
    "this.base&&this.base.parentNode": "this.__P",
    "o.children[0],": "o.children,",
    "this.shadow.firstChild": "undefined",
  };
}
