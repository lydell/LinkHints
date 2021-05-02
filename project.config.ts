// @flow strict-local

const VERSION = "1.1.1";

const FAVICON_SIZES = [16, 32];
const ICON_SIZES = [...FAVICON_SIZES, 48, 64, 96, 128, 256];

const ICONS = {
  svg: makeIcons("svg-$normal", ".svg"),
  png: makeIcons("png-$normal", ".png"),
};

const ICONS_DISABLED = {
  svg: makeIcons("svg-$disabled", ".svg"),
  png: makeIcons("png-$disabled", ".png"),
};

const FAVICONS: Array<{
  input: string;
  output: string;
  size: number;
}> = ICONS.svg
  .filter(([size]) => FAVICON_SIZES.includes(size))
  .map(([size, svg]) => ({
    input: svg,
    output: `favicon-${size}.png`,
    size,
  }));

const mainIcon = "icons/main.svg";

const currentBrowser = getBrowser();

export default {
  meta: {
    version: VERSION,
    name: "Link Hints",
    slug: "LinkHints",
    author: "Simon Lydell",
    description: "Click with your keyboard.",
    homepage: "https://lydell.github.io/LinkHints",
    tutorial: "https://lydell.github.io/LinkHints/tutorial.html",
    repo: "https://github.com/lydell/LinkHints",
    newIssue: "https://github.com/lydell/LinkHints/issues/new/choose",
    changelog: "https://github.com/lydell/LinkHints/issues/1",
    issues: "https://github.com/lydell/LinkHints/issues/",
    icon: mainIcon,
    webExtBaseName: `link_hints-${VERSION}`,
    geckoId: "linkhints@lydell.github.io",
  },
  prod: currentBrowser != null,
  browser: currentBrowser,
  src: "src",
  compiled: "compiled",
  dist: currentBrowser == null ? "dist" : `dist-${currentBrowser}`,
  webextIgnoreFiles: [
    "icons/*.!(svg)",
    ...browserSpecificIgnores(currentBrowser),
  ],
  iconsDir: "icons",
  mainIcon,
  icons: ICONS,
  iconsDisabled: ICONS_DISABLED,
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
    input: "background/main.ts",
    output: "background.js",
  },
  worker: {
    input: "worker/main.ts",
    output: "worker.js",
  },
  renderer: {
    input: "renderer/main.ts",
    output: "renderer.js",
  },
  popup: {
    input: "popup/main.ts",
    output: "popup.js",
  },
  popupCss: {
    input: "popup/popup.css",
    output: "popup.css",
  },
  popupHtml: "popup.html",
  options: {
    input: "options/main.ts",
    output: "options.js",
  },
  optionsCss: {
    input: "options/options.css",
    output: "options.css",
  },
  optionsHtml: "options.html",
  manifest: {
    input: "manifest.ts",
    output: "manifest.json",
  },
  docs: {
    src: "docs",
    compiled: "compiled-docs",
    root: currentBrowser == null ? "." : "/LinkHints",
    icons: {
      keycap: "keycap.svg",
      icon: "icon.svg",
      iconDisabled: "icon-disabled.svg",
    },
    favicons: FAVICONS,
    iconsDir: "icons",
    sharedCss: {
      input: "shared.css",
      output: "shared.css",
    },
    index: {
      input: "index.tsx",
      output: "index.html",
    },
    indexCss: {
      input: "index.css",
      output: "index.css",
    },
    tutorial: {
      input: "tutorial.tsx",
      output: "tutorial.html",
    },
    tutorialCss: {
      input: "tutorial.css",
      output: "tutorial.css",
    },
  },
  colors: {
    lightgrey: "#f7f7f7",
    grey: "#bbb",
    darkgrey: "#767676",
    blue: "#2b4eed",
    red: "#ec130e",
    green: "#0f0",
    // The purple used in Firefox for findbar "Highlight all" matches.
    purple: "#ef0fff",
    // The yellow used in Chrome for findbar matches.
    yellow: "#f6ff00",
    badge: "#323234",
  },
};

function getBrowser(): Browser | undefined {
  switch (process.env.BROWSER) {
    case "chrome":
      return "chrome";
    case "firefox":
      return "firefox";
    default:
      return undefined;
  }
}

function browserSpecificIgnores(browser: Browser | undefined): Array<string> {
  switch (browser) {
    case "chrome":
      return ["icons/svg-*"];
    case "firefox":
      return ["icons/png-*"];
    case undefined:
      return [];
  }
}

function needsPolyfill(browser: Browser | undefined): boolean {
  switch (browser) {
    case "firefox":
      return false;

    case "chrome":
    case undefined:
      return true;
  }
}

function makeIcons(name: string, extension: string): Array<[number, string]> {
  return ICON_SIZES.map((size) => [size, `icons/${name}/${size}${extension}`]);
}
