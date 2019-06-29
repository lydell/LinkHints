// @flow strict-local

import minifyCSS from "minifycss";

import config from "../project.config";

export default function transformCSS(code: string): string {
  const replaced = replaceIcons(replaceColors(code));
  return config.prod ? minifyCSS(replaced) : replaced;
}

function replaceColors(code: string): string {
  const { colors } = config;
  const regex = RegExp(`\\b(${Object.keys(colors).join("|")})\\b`, "g");
  return code.replace(regex, (_, color) => colors[color]);
}

function replaceIcons(code: string): string {
  const { icons } = config.docs;
  const regex = RegExp(`url\\((${Object.keys(icons).join("|")})\\)`, "g");
  return code.replace(
    regex,
    (_, icon) =>
      `url("${config.docs.root}/${config.docs.iconsDir}/${icons[icon]}")`
  );
}
