// @flow strict-local

// Remember to keep `decodeElementType` below in sync.
export type ElementType =
  | "clickable"
  | "clickable-event"
  | "label"
  | "link"
  | "selectable"
  | "scrollable"
  | "textarea"
  | "title";

// Remember to keep `decodeElementTypes` below in sync.
export type ElementTypes = Array<ElementType> | "selectable";

export function decodeElementType(type: string): ?ElementType {
  switch (type) {
    case "clickable":
    case "clickable-event":
    case "label":
    case "link":
    case "selectable":
    case "scrollable":
    case "textarea":
    case "title":
      return type;
    default:
      return undefined;
  }
}

export function decodeElementTypes(type: string): ?ElementTypes {
  switch (type) {
    case "selectable":
      return type;
    default:
      return undefined;
  }
}

export type Point = {|
  x: number,
  y: number,
  align: "left" | "right",
|};

export type HintMeasurements = {|
  ...Point,
  maxX: number,
  weight: number,
|};

export type VisibleElement = {|
  element: HTMLElement,
  type: ElementType,
  measurements: HintMeasurements,
  hasClickListener: boolean,
|};

export type ElementReport = {|
  type: ElementType,
  index: number,
  hintMeasurements: HintMeasurements,
  url: ?string,
  title: ?string,
  text: string,
  textWeight: number,
  isTextInput: boolean,
  hasClickListener: boolean,
|};

export type ExtendedElementReport = {|
  ...ElementReport,
  frame: {|
    id: number,
    index: number,
  |},
  hidden: boolean,
|};

export type ElementWithHint = {|
  ...ExtendedElementReport,
  weight: number,
  hint: string,
|};

export type HintUpdate =
  | {|
      type: "Hide",
      index: number,
      hidden: true,
    |}
  | {|
      type: "UpdateContent",
      index: number,
      order: number,
      matchedChars: string,
      restChars: string,
      highlighted: boolean,
      hidden: boolean,
    |}
  | {|
      type: "UpdatePosition",
      index: number,
      order: number,
      hint: string,
      hintMeasurements: HintMeasurements,
      highlighted: boolean,
      hidden: boolean,
    |};
