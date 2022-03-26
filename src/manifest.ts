import config from "../project.config";

type IconsList = Array<[number, string]>;
type Icons = { svg: IconsList; png: IconsList };
type IconSizes = Record<string, string>;

export default (): string =>
  toJSON({
    manifest_version: 2,
    version: config.meta.version,
    name: config.meta.name,
    author: config.meta.author,
    description: config.meta.description,
    homepage_url: config.meta.homepage,
    browser_specific_settings: getBrowserSpecificSettings(config.browser),
    icons: getIcons(config.icons, config.browser),
    permissions: [
      // Needed for injecting content scripts in already open tabs on install,
      // and for checking if tabs are allowed to run content scripts at all (so
      // that the toolbar button can update).
      "<all_urls>",
      // Needed to store options.
      "storage",
      // Needed to copy to the clipboard.
      "clipboardWrite",
    ],
    browser_action: {
      browser_style: true,
      default_popup: config.popupHtml,
      default_icon: getIcons(config.icons, config.browser),
    },
    options_ui: {
      page: config.optionsHtml,
      open_in_tab: true,
    },
    background: {
      scripts: [
        config.needsPolyfill ? config.polyfill.output : undefined,
        config.background.output,
      ].filter((script) => script !== undefined),
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
        ].filter((script) => script !== undefined),
      },
      {
        matches: ["<all_urls>"],
        run_at: "document_start",
        js: [
          // We need to put the polyfill both here and above, because Chrome
          // does not seem to guarantee the content scripts to run in order.
          // Each `js` array runs in order, but not the `content_scripts` array
          // it seems. See: https://github.com/lydell/LinkHints/issues/51
          // It’s a tiny bit wasteful to load the polyfill twice in the top
          // frame, but it’s not so bad.
          config.needsPolyfill ? config.polyfill.output : undefined,
          config.renderer.output,
        ].filter((script) => script !== undefined),
      },
    ],
  });

function toJSON(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, undefined, 2);
}

function getBrowserSpecificSettings(browser: Browser | undefined): unknown {
  switch (browser) {
    case "chrome":
      return undefined;

    case "firefox":
    case undefined:
      return {
        gecko: {
          id: config.meta.geckoId,
        },
      };
  }
}

function makeSizes(icons: Array<[number, string]>): IconSizes {
  return Object.fromEntries(
    icons.map(([size, path]) => [size.toString(), path])
  );
}

function getIcons(icons: Icons, browser: Browser | undefined): IconSizes {
  switch (browser) {
    case "firefox":
      return makeSizes(icons.svg);

    case "chrome":
    case undefined:
      return makeSizes(icons.png);
  }
}
