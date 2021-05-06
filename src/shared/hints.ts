// @flow strict-local

import { array, multi, stringUnion } from "tiny-decoders";

export type ElementType = ReturnType<typeof ElementType>;
export const ElementType = stringUnion({
  "clickable-event": null,
  clickable: null,
  label: null,
  link: null,
  scrollable: null,
  selectable: null,
  textarea: null,
});

export type ElementTypes = ReturnType<typeof ElementTypes>;
export const ElementTypes = multi({
  array: array(ElementType),
  string: stringUnion({
    selectable: null,
  }),
});

export type Point = {
  x: number;
  y: number;
  align: "left" | "right";
  debug: string;
};

export type HintMeasurements = Point & {
  maxX: number;
  weight: number;
};

export type VisibleElement = {
  element: HTMLElement;
  type: ElementType;
  measurements: HintMeasurements;
  hasClickListener: boolean;
};

export type ElementReport = {
  type: ElementType;
  index: number;
  hintMeasurements: HintMeasurements;
  url: string | undefined;
  urlWithTarget: string | undefined;
  text: string;
  textContent: boolean;
  textWeight: number;
  isTextInput: boolean;
  hasClickListener: boolean;
};

export type ExtendedElementReport = ElementReport & {
  frame: {
    id: number;
    index: number;
  };
  hidden: boolean;
};

export type ElementWithHint = ExtendedElementReport & {
  weight: number;
  hint: string;
};

export function elementKey(element: ElementWithHint): string {
  const { x, y, align } = element.hintMeasurements;
  return [x, y, align, element.hint].join("\n");
}

export type ElementRender = {
  hintMeasurements: HintMeasurements;
  hint: string;
  highlighted: boolean;
  invertedZIndex: number;
};

export type HintUpdate =
  | {
      type: "Hide";
      index: number;
      hidden: true;
    }
  | {
      type: "UpdateContent";
      index: number;
      order: number;
      matchedChars: string;
      restChars: string;
      highlighted: boolean;
      hidden: boolean;
    }
  | {
      type: "UpdatePosition";
      index: number;
      order: number;
      hint: string;
      hintMeasurements: HintMeasurements;
      highlighted: boolean;
      hidden: boolean;
    };
