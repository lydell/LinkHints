// @flow

const fs = require("fs");
const path = require("path");

const resolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const replace = require("rollup-plugin-replace");
const { terser } = require("rollup-plugin-terser");
const rimraf = require("rimraf");
const flow = require("rollup-plugin-flow");

const config = require("./project.config");

const PROD = config.browser != null;

const TERSER_OPTIONS = {
  ecma: 8,
  compress: {
    booleans: false,
    comparisons: false,
    conditionals: false,
    hoist_props: false,
    keep_fnames: true,
    keep_infinity: true,
    loops: false,
    reduce_funcs: false,
    reduce_vars: false,
    sequences: false,
    toplevel: true,
    typeofs: false,
  },
  mangle: false,
  output: {
    beautify: true,
    braces: true,
    comments: /\S/,
    indent_level: 2,
  },
};

setup();

// $FlowIgnore: Flow wants a type annotation here, but that’s just annoying.
module.exports = [
  js(config.setup),
  js(config.background),
  js(config.worker),
  js(config.renderer),
  js(config.popup),
  template(config.manifest),
  template(config.iconsCompilation),
  html({ html: config.popupHtml, js: config.popup.output }),
  config.needsPolyfill ? copy(config.polyfill) : undefined,
]
  .filter(Boolean)
  .map(entry => ({
    ...entry,
    input: `${config.src}/${entry.input}`,
    output: {
      ...entry.output,
      file: `${config.src}/${entry.output.file}`,
    },
  }));

function setup() {
  if (PROD) {
    rimraf.sync(config.rimraf);
  }
}

function js({ input, output } /* : {| input: string, output: string |} */) {
  return {
    input,
    output: {
      file: output,
      format: "iife",
      sourcemap: !PROD,
    },
    plugins: [
      flow({ pretty: true }),
      replace({
        BROWSER:
          config.browser == null ? "BROWSER" : JSON.stringify(config.browser),
        BUILD_TIME: () =>
          JSON.stringify(new Date().toISOString(), undefined, 2),
      }),
      PROD && terser(TERSER_OPTIONS),
      resolve(),
      commonjs(),
    ].filter(Boolean),
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
  } /* : {|
    input: string,
    output: string,
    data?: any,
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
        load: id => {
          delete require.cache[id];
          content = require(id)(data);
          return "0";
        },
        transformBundle: () => content,
      },
    ],
  };
}

function html(files /* : {| html: string, js: string |} */) {
  return template({
    input: "html.js",
    output: files.html,
    data: {
      polyfill: config.needsPolyfill
        ? path.relative(path.dirname(files.html), config.polyfill.output)
        : undefined,
      js: path.relative(path.dirname(files.html), files.js),
    },
  });
}

function copy({ input, output } /* : {| input: string, output: string, |} */) {
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
        load: id => {
          content = fs.readFileSync(id, "utf8");
          return "0";
        },
        transformBundle: () => content,
      },
    ],
  };
}
