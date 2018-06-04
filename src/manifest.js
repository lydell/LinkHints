// @flow

const config = require("../project.config");

type IconSizes = { [size: string]: string };

type ThemeIcon = {|
  light: string,
  dark: string,
  size: number,
|};

module.exports = () =>
  toJSON({
    manifest_version: 2,
    version: "0.0.0",
    name: "Synth",
    author: "Simon Lydell",
    description: "Click things on the web using the keyboard.",
    homepage_url: "https://github.com/lydell/synth",
    icons: getIcons(config.browser),
    browser_action: {
      browser_style: true,
      default_popup: config.popupHtml,
      default_icon: getDefaultIcon(config.browser),
      theme_icons: getThemeIcons(config.browser),
    },
    commands: {
      _execute_browser_action: {
        suggested_key: {
          default: "Ctrl+Shift+D",
        },
      },
    },
    background: {
      scripts: [
        getPolyfill(config.browser),
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
          getPolyfill(config.browser),
          config.setup.output,
          config.observer.output,
        ].filter(Boolean),
      },
      {
        matches: ["<all_urls>"],
        run_at: "document_start",
        js: [config.renderer.output],
        css: ["./renderer/main.css"],
      },
    ],
  });

function toJSON(obj: any): string {
  return JSON.stringify(obj, undefined, 2);
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

function getIcons(browser: ?Browser): ?IconSizes {
  switch (browser) {
    case "firefox":
      return makeSizes(config.icons.light);

    default:
      return makeSizes(config.icons.png);
  }
}

function getDefaultIcon(browser: ?Browser): ?IconSizes {
  switch (browser) {
    case "firefox":
      return undefined;

    default:
      return makeSizes(config.icons.png);
  }
}

function getThemeIcons(browser: ?Browser): ?Array<ThemeIcon> {
  switch (browser) {
    case "chrome":
      return undefined;

    default:
      return config.icons.light.map(([size, light], index) => {
        const [, dark] = config.icons.dark[index];
        return { light, dark, size };
      });
  }
}

function getPolyfill(browser: ?Browser): ?string {
  switch (browser) {
    case "firefox":
      return undefined;

    default:
      return config.polyfill.output;
  }
}
