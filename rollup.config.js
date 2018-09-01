// @flow

const fs = require("fs");
const path = require("path");

const resolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const replace = require("rollup-plugin-replace");
const rimraf = require("rimraf");
const flow = require("rollup-plugin-flow");

const config = require("./project.config");

const PROD = config.browser != null;

setup();

// $FlowIgnore: Flow wants a type annotation here, but that’s just annoying.
module.exports = [
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
      indent: false,
    },
  }));

function setup() {
  if (PROD) {
    rimraf.sync(config.rimraf);
  }
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
      flow({ pretty: true }),
      replace(makeGlobals()),
      resolve(),
      commonjs(),
    ].filter(Boolean),
    onwarn: (warning /*: any */) => {
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

function html(files /*: {| html: string, js: string |} */) {
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
      config.browser == null ? "BROWSER" : JSON.stringify(config.browser),
    // All types of events that likely makes an element clickable. All code and
    // comments that deal with this only refer to "click", though, to keep
    // things simple. This is defined here so that the array can be shared
    // between `worker/program.js` and `worker/injected.js`.
    CLICKABLE_EVENT_NAMES: JSON.stringify(["click", "mousedown"]),
    // If a malicious site sends these events it doesn't hurt much. All the page
    // could do is cause false positives or disable detection of click events
    // altogeher.
    INJECTED_CLICKABLE_EVENT: JSON.stringify("__SynthWebExt_Clickable"),
    INJECTED_UNCLICKABLE_EVENT: JSON.stringify("__SynthWebExt_Unclickable"),
    INJECTED_QUEUE_EVENT: JSON.stringify("__SynthWebExt_Queue"),
    // Name of the global variable created by the injected script. The `\0`
    // prevents it from turning up in autocomplete when typing `window.` in the
    // Chrome console. Firefox still shows it, but accepting the autocomplete
    // causes a syntax error. Again, a malicious site can't do much with this,
    // except disabling detection of click events.
    INJECTED_VAR: JSON.stringify("__SynthWebExt\0"),
    PROD: JSON.stringify(PROD),
  };
}
