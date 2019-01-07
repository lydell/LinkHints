// @flow strict-local

import type { Icons } from "./icons";

const config = require("../project.config");

type IconSizes = { [size: string]: string };

module.exports = () =>
  toJSON({
    manifest_version: 2,
    version: "0.0.0",
    name: "Synth",
    author: "Simon Lydell",
    description: "Click things on the web using the keyboard.",
    homepage_url: "https://github.com/lydell/synth",
    browser_specific_settings: getBrowserSpecificSettings(config.browser),
    icons: getIcons(config.icons, config.browser),
    permissions: [
      // Needed for injecting content scripts in already open tabs on install,
      // and for checking if tabs are allowed to run content scripts at all (so
      // that the toolbar button can update).
      "<all_urls>",
    ],
    browser_action: {
      browser_style: true,
      default_popup: config.popupHtml,
      default_icon: getIcons(config.icons, config.browser),
    },
    commands: {
      _execute_browser_action: {
        suggested_key: {
          default: "Ctrl+Shift+F",
        },
      },
    },
    background: {
      scripts: [
        config.needsPolyfill ? config.polyfill.output : undefined,
        config.background.output,
      ].filter(Boolean),
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        all_frames: true,
        match_about_blank: true,
        run_at: "document_start",
        js: [
          config.needsPolyfill ? config.polyfill.output : undefined,
          config.worker.output,
        ].filter(Boolean),
      },
      {
        matches: ["<all_urls>"],
        run_at: "document_start",
        js: [config.renderer.output],
      },
    ],
  });

function toJSON(obj: mixed): string {
  return JSON.stringify(obj, undefined, 2);
}

function getBrowserSpecificSettings(browser: ?Browser): mixed {
  switch (browser) {
    case "firefox":
      return {
        gecko: {
          id: "synth@lydell.github.io",
        },
      };

    default:
      return undefined;
  }
}

function makeSizes(icons: Array<[number, string]>): IconSizes {
  return icons.reduce(
    (result, [size, path]) => ({
      ...result,
      [size]: path,
    }),
    {}
  );
}

function getIcons(icons: Icons, browser: ?Browser): ?IconSizes {
  switch (browser) {
    case "firefox":
      return makeSizes(icons.svg);

    default:
      return makeSizes(icons.png);
  }
}
