// @flow strict-local

const spawn = require("cross-spawn");

const config = require("../project.config");

function run() {
  for (const icons of [config.icons, config.iconsDisabled]) {
    for (const [index, [, svg]] of icons.svg.entries()) {
      const [, png] = icons.png[index];
      svgToPng(`${config.compiled}/${svg}`, `${config.src}/${png}`);
    }
  }

  const faviconSources = config.icons.svg.filter(([size]) =>
    config.faviconSizes.includes(size)
  );
  for (const [size, svg] of faviconSources) {
    svgToPng(`${config.compiled}/${svg}`, `docs/favicon-${size}.png`);
  }
}

function svgToPng(svgPath, pngPath) {
  spawn.sync("inkscape", ["-z", "-e", pngPath, svgPath], {
    stdio: "inherit",
  });

  spawn.sync("optipng", ["-strip", "all", "-o7", pngPath], {
    stdio: "inherit",
  });
}

run();
