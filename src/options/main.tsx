// @flow strict-local

import { h, render } from "preact";

import OptionsProgram from "./Program";

function start(): void {
  const { body } = document;
  if (body == null) {
    return;
  }

  render(
    <OptionsProgram
      ref={(program: OptionsProgram | null) => {
        // Attach the instance to `window` for debugging in the regular Web
        // Console.
        // @ts-expect-error Only for debugging use.
        window.optionsProgram = program;
      }}
    />,
    body
  );
}

start();
