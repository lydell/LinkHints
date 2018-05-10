// @flow

const rimraf = require("rimraf");
const flow = require("rollup-plugin-flow");

const config = require("./project.config");

const PROD = process.env.PROD === "true";

if (PROD) {
  rimraf.sync(config.rimraf);
}

// $FlowIgnore: Flow wants a type annotation here, but that’s just annoying.
module.exports = [
  js(config.background),
  js(config.allFrames),
  js(config.topFrame),
  template(config.manifest),
].map(entry => ({
  ...entry,
  input: `${config.src}/${entry.input}`,
  output: {
    ...entry.output,
    file: `${config.src}/${entry.output.file}`,
  },
}));

function js({ input, output } /* : {| input: string, output: string |} */) {
  return {
    input,
    output: {
      file: output,
      format: "iife",
      indent: false,
      sourcemap: !PROD,
    },
    plugins: [flow({ pretty: true })],
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
        load: (id /* : string */) => {
          delete require.cache[id];
          content = require(id)(data);
          return "0";
        },
        transformBundle: () => content,
      },
    ],
  };
}
