// @flow strict-local

const currentBrowser = getBrowser();

const FAVICON_SIZES = [16, 32];
const ICON_SIZES = [...FAVICON_SIZES, 48, 64, 96, 128, 256];

const mainIcon = "icons/main.svg";

module.exports = {
  meta: {
    version: "0.0.0",
    name: "Link Hints",
    author: "Simon Lydell",
    description: "Click with your keyboard.",
    homepage: "https://lydell.github.io/LinkHints",
    icon: mainIcon,
  },
  browser: currentBrowser,
  src: "src",
  compiled: "compiled",
  dist: currentBrowser == null ? "dist" : `dist-${currentBrowser}`,
  webextIgnoreFiles: [
    "icons/*.!(svg)",
    ...browserSpecificIgnores(currentBrowser),
  ],
  faviconSizes: FAVICON_SIZES,
  iconsDir: "icons",
  mainIcon,
  icons: {
    svg: makeIcons("svg-$normal", ".svg"),
    png: makeIcons("png-$normal", ".png"),
  },
  iconsDisabled: {
    svg: makeIcons("svg-$disabled", ".svg"),
    png: makeIcons("png-$disabled", ".png"),
  },
  iconsTestPage: "icons/test.html",
  iconsChecksum: "icons/checksum.js",
  iconsCompilation: {
    input: "icons.js",
    output: "../icon.svg",
  },
  needsPolyfill: needsPolyfill(currentBrowser),
  polyfill: {
    input: "../node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
    output: "browser-polyfill.js",
  },
  background: {
    input: "background/main.js",
    output: "background.js",
  },
  worker: {
    input: "worker/main.js",
    output: "worker.js",
  },
  renderer: {
    input: "renderer/main.js",
    output: "renderer.js",
  },
  popup: {
    input: "popup/main.js",
    output: "popup.js",
  },
  popupCss: {
    input: "popup/popup.css",
    output: "popup.css",
  },
  popupHtml: "popup.html",
  options: {
    input: "options/main.js",
    output: "options.js",
  },
  optionsCss: {
    input: "options/options.css",
    output: "options.css",
  },
  optionsHtml: "options.html",
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
      return ["icons/svg-*"];
    case "firefox":
      return ["icons/png-*"];
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
