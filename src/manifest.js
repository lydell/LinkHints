// @flow

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
    applications: getApplications(config.browser),
    icons: getIcons(config.icons, config.browser),
    permissions: [
      // Needed for injecting content scripts in already open tabs on install.
      "<all_urls>",
    ],
    browser_action: {
      browser_style: true,
      default_popup: config.popupHtml,
      default_icon: getIcons(config.iconsDisabled, config.browser),
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
        config.setup.output,
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
          config.setup.output,
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

function toJSON(obj: any): string {
  return JSON.stringify(obj, undefined, 2);
}

function getApplications(browser: ?Browser): mixed {
  switch (browser) {
    case "firefox":
      return {
        gecko: {
          id: "synth@github.com",
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
