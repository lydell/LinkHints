import config from "../project.config";

type IconsList = Array<[number, string]>;
type Icons = { svg: IconsList; png: IconsList };
type IconSizes = Record<string, string>;

export default (): string =>
  toJSON({
    manifest_version: 3,
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
    ],
    action: {
      default_popup: config.popupHtml,
      default_icon: getIcons(config.icons, config.browser),
    },
    options_ui: {
      page: config.optionsHtml,
      open_in_tab: true,
    },
    background: getBackground(config.browser),
    content_scripts: [
      {
        matches: ["<all_urls>"],
        all_frames: true,
        match_about_blank: true,
        run_at: "document_start",
        js: [config.worker.output],
      },
      config.browser === "firefox"
        ? undefined
        : {
            matches: ["<all_urls>"],
            all_frames: true,
            match_about_blank: true,
            run_at: "document_start",
            world: "MAIN",
            js: [config.injected.output],
          },
      {
        matches: ["<all_urls>"],
        run_at: "document_start",
        js: [config.renderer.output],
      },
    ].filter((script) => script !== undefined),
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

function getBackground(browser: Browser | undefined): Record<string, unknown> {
  switch (browser) {
    case "firefox":
      return {
        scripts: [config.background.output],
      };

    case "chrome":
      return {
        service_worker: config.background.output,
      };

    case undefined:
      return {
        scripts: [config.background.output],
        service_worker: config.background.output,
      };
  }
}
