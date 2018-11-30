// @flow strict-local

import {
  array,
  constant,
  fieldAndThen,
  map,
  number,
  record,
  repr,
  string,
} from "tiny-decoders";

import { type ElementTypes, decodeElementTypes } from "../shared/hints";
import type { Box } from "../shared/main";

export type FrameMessage =
  | {|
      type: "FindElements",
      token: string,
      types: ElementTypes,
      viewports: Array<Box>,
    |}
  | {|
      type: "UpdateElements",
      token: string,
      viewports: Array<Box>,
    |};

export const decodeFrameMessage: mixed => FrameMessage = fieldAndThen(
  "type",
  string,
  getFrameMessageDecoder
);

function getFrameMessageDecoder(type: string): mixed => FrameMessage {
  switch (type) {
    case "FindElements":
      return record({
        type: constant("FindElements"),
        token: () => "",
        types: decodeElementTypes,
        viewports: decodeViewports,
      });

    case "UpdateElements":
      return record({
        type: constant("UpdateElements"),
        token: () => "",
        viewports: decodeViewports,
      });

    default:
      throw new Error(`Unknown FrameMessage type: ${type}`);
  }
}

const finiteNumber: mixed => number = map(number, finite);

const decodeViewports: mixed => Array<Box> = array(
  record({
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber,
    height: finiteNumber,
  })
);

function finite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Expected a finite number, but got: ${repr(value)}`);
  }
  return value;
}
