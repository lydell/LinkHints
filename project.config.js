// @flow

module.exports = {
  src: "src",
  rimraf: "src/compiled",
  webextIgnoreFiles: [`*.js`, `!(compiled)/**/*.js`],
  background: {
    input: "background/main.js",
    output: "compiled/background.js",
  },
  allFrames: {
    input: "allFrames/main.js",
    output: "compiled/allFrames.js",
  },
  topFrame: {
    input: "topFrame/main.js",
    output: "compiled/topFrame.js",
  },
  manifest: {
    input: "manifest.js",
    output: "manifest.json",
  },
};
