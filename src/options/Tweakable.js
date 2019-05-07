// This file is allowed to import `tweakable` objects from the other programs.
// Thanks to Rollup this does not blow up the bundle size.
/* eslint-disable import/no-restricted-paths */

// @flow strict-local

import * as React from "preact";

import {
  t as tBackground,
  tMeta as tMetaBackground,
} from "../background/Program";
import { t as tRenderer, tMeta as tMetaRenderer } from "../renderer/Program";
import {
  t as tElementManager,
  tMeta as tMetaElementManager,
} from "../worker/ElementManager";

type Props = {||};

type State = {||};

export default class Tweakable extends React.Component<Props, State> {
  render() {
    return (
      <pre>
        {JSON.stringify(
          {
            Background: {
              current: tBackground,
              defaults: tMetaBackground.defaults,
            },
            Renderer: {
              current: tRenderer,
              defaults: tMetaRenderer.defaults,
            },
            ElementManager: {
              current: tElementManager,
              defaults: tMetaElementManager.defaults,
            },
          },
          (key, value) => (value instanceof Set ? Array.from(value) : value),
          2
        )}
      </pre>
    );
  }
}
