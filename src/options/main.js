// @flow strict-local

import { createElement, render } from "preact";

import OptionsProgram from "./Program";

function start() {
  const { body } = document;
  if (body == null) {
    return;
  }

  render(
    createElement(OptionsProgram, {
      ref: (program) => {
        // Attach the instance to `window` for debugging in the regular Web
        // Console.
        window.optionsProgram = program;
      },
    }),
    body
  );
}

start();
