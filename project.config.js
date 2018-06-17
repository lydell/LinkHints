// @flow

const currentBrowser = getBrowser();

const ICON_SIZES = [16, 32, 48, 64, 96, 128, 256];

module.exports = {
  browser: currentBrowser,
  src: "src",
  dist: "dist",
  rimraf: "src/compiled",
  webextIgnoreFiles: [
    `*.js`,
    `!(compiled)/**/*.js`,
    "icons/*.html",
    ...browserSpecificIgnores(currentBrowser),
  ],
  icons: {
    light: makeIcons("light", ".svg"),
    dark: makeIcons("dark", ".svg"),
    png: makeIcons("png", ".png"),
    testPage: "icons/test.html",
  },
  iconsCompilation: {
    input: "icons.js",
    output: "../icon.svg",
  },
  needsPolyfill: needsPolyfill(currentBrowser),
  polyfill: {
    input: "../node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
    output: "compiled/browser-polyfill.js",
  },
  setup: {
    input: "shared/setup.js",
    output: "compiled/setup.js",
  },
  background: {
    input: "background/main.js",
    output: "compiled/background.js",
  },
  worker: {
    input: "worker/main.js",
    output: "compiled/worker.js",
  },
  renderer: {
    input: "renderer/main.js",
    output: "compiled/renderer.js",
  },
  popup: {
    input: "popup/main.js",
    output: "compiled/popup.js",
  },
  popupHtml: "compiled/popup.html",
  manifest: {
    input: "manifest.js",
    output: "manifest.json",
  },
};

function getBrowser(): ?Browser {
  switch (process.env.BROWSER) {
    case ("chrome": Browser):
      return "chrome";
    case ("firefox": Browser):
      return "firefox";
    default:
      return undefined;
  }
}

function browserSpecificIgnores(browser: ?Browser): Array<string> {
  switch (browser) {
    case "chrome":
      return ["icons/**/*.svg"];
    case "firefox":
      return ["icons/**/*.png"];
    default:
      return [];
  }
}

function needsPolyfill(browser: ?Browser): boolean {
  switch (browser) {
    case "firefox":
      return false;

    default:
      return true;
  }
}

function makeIcons(name: string, extension: string): Array<[number, string]> {
  return ICON_SIZES.map(size => [size, `icons/${name}/${size}${extension}`]);
}
