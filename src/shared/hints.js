// @flow

export type ElementType =
  | "clickable"
  | "clickable-event"
  | "label"
  | "link"
  | "selectable"
  | "scrollable"
  | "textarea"
  | "title";

export type ElementTypes = Array<ElementType> | "selectable";

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
