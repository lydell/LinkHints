// @flow strict-local

const currentBrowser = getBrowser();

const ICON_SIZES = [16, 32, 48, 64, 96, 128, 256];

const mainIcon = "compiled/icon.svg";

module.exports = {
  meta: {
    version: "0.0.0",
    name: "Synth",
    slug: "synth",
    author: "Simon Lydell",
    description: "Click things on the web using the keyboard.",
    homepage: "https://github.com/lydell/synth",
    icon: mainIcon,
  },
  browser: currentBrowser,
  src: "src",
  dist: "dist",
  rimraf: "{src/compiled,src/icons/!(png-*|*.js)}",
  webextIgnoreFiles: [
    `*.js`,
    // Having both of the following two patterns might seem redundant. The first
    // is needed to make sure make sure changing non-compiled JS files don’t
    // trigger the web-ext watcher during development. The second excludes empty
    // directories from the production build.
    `./!(compiled)/**/*.js`,
    `./!(compiled|icons|manifest.json)`,
    "icons/*.*",
    ...browserSpecificIgnores(currentBrowser),
  ],
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
    output: "compiled/browser-polyfill.js",
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
  popupCss: {
    input: "popup/popup.css",
    output: "compiled/popup.css",
  },
  popupHtml: "compiled/popup.html",
  options: {
    input: "options/main.js",
    output: "compiled/options.js",
  },
  optionsCss: {
    input: "options/options.css",
    output: "compiled/options.css",
  },
  optionsHtml: "compiled/options.html",
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
