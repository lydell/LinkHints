// @flow strict-local

import { createElement, render } from "preact";

import OptionsProgram from "./Program";

function start() {
  const { body } = document;
  if (body == null) {
    return;
  }

  render(createElement(OptionsProgram, { placeholder: "placeholder" }), body);
}

start();
