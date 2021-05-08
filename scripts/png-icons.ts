import * as spawn from "cross-spawn";

import config from "../project.config";

function run(): void {
  for (const icons of [config.icons, config.iconsDisabled]) {
    for (const [index, [, svg]] of icons.svg.entries()) {
      const [, png] = icons.png[index];
      svgToPng(`${config.compiled}/${svg}`, `${config.src}/${png}`);
    }
  }

  for (const { input, output } of config.docs.favicons) {
    svgToPng(
      `${config.compiled}/${input}`,
      `${config.docs.src}/${config.docs.iconsDir}/${output}`
    );
  }
}

function svgToPng(svgPath: string, pngPath: string): void {
  spawn.sync("inkscape", ["-z", "-e", pngPath, svgPath], {
    stdio: "inherit",
  });

  spawn.sync("optipng", ["-strip", "all", "-o7", pngPath], {
    stdio: "inherit",
  });
}

run();
