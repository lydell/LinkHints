// @flow

const config = require("../project.config");

const toJSON = obj => JSON.stringify(obj, undefined, 2);

module.exports = () =>
  toJSON({
    manifest_version: 2,
    version: "0.0.0",
    name: "Synth",
    author: "Simon Lydell",
    description: "Click things on the web using the keyboard.",
    homepage_url: "https://github.com/lydell/synth",
    background: {
      scripts: [config.background.output],
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        all_frames: true,
        match_about_blank: true,
        run_at: "document_start",
        js: [config.allFrames.output],
      },
      {
        matches: ["<all_urls>"],
        run_at: "document_start",
        js: [config.topFrame.output],
      },
    ],
  });
