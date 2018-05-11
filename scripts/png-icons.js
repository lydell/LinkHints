// @flow

const path = require("path");

const mkdirp = require("mkdirp");
const spawn = require("cross-spawn");

const config = require("../project.config");

function run() {
  for (const [index, [, light]] of config.icons.light.entries()) {
    const [, png] = config.icons.png[index];
    const lightPath = `${config.src}/${light}`;
    const pngPath = `${config.src}/${png}`;

    mkdirp.sync(path.dirname(pngPath));

    spawn.sync("inkscape", ["-z", "-e", pngPath, lightPath], {
      stdio: "inherit",
    });

    spawn.sync("optipng", ["-strip", "all", "-o7", pngPath], {
      stdio: "inherit",
    });
  }
}

run();
