// @flow strict-local

import jsTokens from "js-tokens";
import * as React from "preact";

import config from "../project.config";
import scripts from "./scripts.es5";

type Props = {|
  macifyKbd?: boolean,
  observeQuickLinks?: boolean,
  autoCloseDetails?: boolean,
|};

export default function Scripts(props: Props) {
  const items = Object.keys(scripts)
    .map(name => {
      const fn = scripts[name];
      return fn != null && props[name] === true
        ? `;(${fn.toString()})();`
        : undefined;
    })
    .filter(Boolean);

  const code = items.join("");

  return items.length > 0 ? (
    <script
      dangerouslySetInnerHTML={{ __html: config.prod ? minifyJS(code) : code }}
    />
  ) : null;
}

function minifyJS(js: string): string {
  return js.replace(jsTokens, match =>
    match.startsWith("/*") || match.startsWith("//")
      ? ""
      : /^\s+$/.test(match)
      ? match.includes("\n")
        ? "\n"
        : " "
      : match
  );
}
