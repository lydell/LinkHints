import jsTokens, { Token } from "js-tokens";
import { h, VNode } from "preact";

import config from "../project.config";
import { scripts } from "./scripts.es5";

type Props = {
  macifyKbd?: boolean;
  observeQuickLinks?: boolean;
  autoCloseDetails?: boolean;
};

export default function Scripts(props: Props): VNode | null {
  const items = Object.entries(scripts)
    .map(([name, fn]) =>
      fn !== undefined && props[name as keyof Props] === true
        ? `;(${fn})();`
        : undefined
    )
    .filter(Boolean);

  const code = items.join("");

  return items.length > 0 ? (
    <script
      dangerouslySetInnerHTML={{ __html: config.prod ? minifyJS(code) : code }}
    />
  ) : null;
}

type State = { ignored: false } | { ignored: true; multiline: boolean };

const NEWLINE = /[\r\n\u2028\u2029]/;

function stateFromToken(token: Token): State {
  switch (token.type) {
    case "MultiLineComment":
      return { ignored: true, multiline: NEWLINE.test(token.value) };
    case "SingleLineComment":
      return { ignored: true, multiline: false };
    case "WhiteSpace":
      return { ignored: true, multiline: false };
    case "LineTerminatorSequence":
      return { ignored: true, multiline: true };
    default:
      return { ignored: false };
  }
}

function minifyJS(js: string): string {
  return Array.from(jsTokens(js)).reduce<[State, Token | undefined, string]>(
    (
      [state, previousToken, result]: [State, Token | undefined, string],
      token
    ) => {
      const tokenState = stateFromToken(token);
      return state.ignored
        ? tokenState.ignored
          ? [
              {
                ignored: true,
                multiline: state.multiline || tokenState.multiline,
              },
              previousToken,
              result,
            ]
          : [
              { ignored: false },
              token,
              result +
                (state.multiline
                  ? "\n"
                  : previousToken !== undefined && previousToken.type !== token.type
                  ? ""
                  : " ") +
                token.value,
            ]
        : tokenState.ignored
        ? [tokenState, previousToken, result]
        : [{ ignored: false }, token, result + token.value];
    },
    [{ ignored: false }, undefined, ""]
  )[2];
}
