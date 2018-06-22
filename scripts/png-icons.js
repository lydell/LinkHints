// @flow

const path = require("path");

const mkdirp = require("mkdirp");
const spawn = require("cross-spawn");

const config = require("../project.config");

function run() {
  for (const icons of [config.icons, config.iconsDisabled]) {
    for (const [index, [, svg]] of icons.svg.entries()) {
      const [, png] = icons.png[index];
      const svgPath = `${config.src}/${svg}`;
      const pngPath = `${config.src}/${png}`;

      mkdirp.sync(path.dirname(pngPath));

      spawn.sync("inkscape", ["-z", "-e", pngPath, svgPath], {
        stdio: "inherit",
      });

      spawn.sync("optipng", ["-strip", "all", "-o7", pngPath], {
        stdio: "inherit",
      });
    }
  }
}

run();
