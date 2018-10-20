// @flow

import { createElement, render } from "preact";

const h = createElement;
const makeElement = tag => (...rest) => h(tag, ...rest);

const br = makeElement("br");
const div = makeElement("div");
const input = makeElement("input");
const label = makeElement("label");

type Props = {| placeholder: string |};

function Test({ placeholder }: Props) {
  return div(label({}, "Test:", br(), input({ type: "text", placeholder })));
}

function start() {
  const { body } = document;
  if (body == null) {
    return;
  }

  render(h(Test, { placeholder: "placeholder" }), body);
}

start();
