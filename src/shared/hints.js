// @flow strict-local

import { type Decoder, array, either, map, repr, string } from "tiny-decoders";

// Remember to keep `decodeElementType` below in sync.
export type ElementType =
  | "clickable"
  | "clickable-event"
  | "label"
  | "link"
  | "selectable"
  | "scrollable"
  | "textarea";

// Remember to keep `decodeElementTypesConstants` below in sync.
export type ElementTypes = Array<ElementType> | "selectable";

export function decodeElementType(type: string): ElementType {
  switch (type) {
    case "clickable":
    case "clickable-event":
    case "label":
    case "link":
    case "selectable":
    case "scrollable":
    case "textarea":
      return type;
    default:
      throw new TypeError(`Invalid ElementType: ${repr(type)}`);
  }
}

export function decodeElementTypesConstants(type: string): ElementTypes {
  switch (type) {
    case "selectable":
      return type;
    default:
      throw new TypeError(`Invalid ElementTypes constant: ${repr(type)}`);
  }
}

export const decodeElementTypes: Decoder<ElementTypes> = either(
  map(string, decodeElementTypesConstants),
  array(map(string, decodeElementType))
);

export type Point = {
  x: number,
  y: number,
  align: "left" | "right",
  debug: string,
};

export type HintMeasurements = {
  ...Point,
  maxX: number,
  weight: number,
};

export type VisibleElement = {
  element: HTMLElement,
  type: ElementType,
  measurements: HintMeasurements,
  hasClickListener: boolean,
};

export type ElementReport = {
  type: ElementType,
  index: number,
  hintMeasurements: HintMeasurements,
  url: ?string,
  urlWithTarget: ?string,
  text: string,
  textContent: boolean,
  textWeight: number,
  isTextInput: boolean,
  hasClickListener: boolean,
};

export type ExtendedElementReport = {
  ...ElementReport,
  frame: {
    id: number,
    index: number,
  },
  hidden: boolean,
};

export type ElementWithHint = {
  ...ExtendedElementReport,
  weight: number,
  hint: string,
};

export function elementKey(element: ElementWithHint): string {
  const { x, y, align } = element.hintMeasurements;
  return [x, y, align, element.hint].join("\n");
}

export type ElementRender = {
  hintMeasurements: HintMeasurements,
  hint: string,
  highlighted: boolean,
  invertedZIndex: number,
};

export type HintUpdate =
  | {
      type: "Hide",
      index: number,
      hidden: true,
    }
  | {
      type: "UpdateContent",
      index: number,
      order: number,
      matchedChars: string,
      restChars: string,
      highlighted: boolean,
      hidden: boolean,
    }
  | {
      type: "UpdatePosition",
      index: number,
      order: number,
      hint: string,
      hintMeasurements: HintMeasurements,
      highlighted: boolean,
      hidden: boolean,
    };
