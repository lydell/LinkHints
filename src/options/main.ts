// @flow strict-local

import { createElement, render } from "preact";

import OptionsProgram from "./Program";

function start(): void {
  const { body } = document;
  if (body == null) {
    return;
  }

  render(
    createElement(OptionsProgram, {
      ref: (program: OptionsProgram) => {
        // Attach the instance to `window` for debugging in the regular Web
        // Console.
        // @ts-expect-error Only for debugging use.
        window.optionsProgram = program;
      },
    }),
    body
  );
}

start();
