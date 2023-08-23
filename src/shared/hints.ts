import {
  array,
  DecoderResult,
  flatMap,
  Infer,
  multi,
  stringUnion,
} from "./codec";

export type ElementType = Infer<typeof ElementType>;
export const ElementType = stringUnion([
  "clickable-event",
  "clickable",
  "label",
  "link",
  "scrollable",
  "selectable",
  "textarea",
]);

export type ElementTypes = Infer<typeof ElementTypes>;
export const ElementTypes = flatMap(multi(["array", "string"]), {
  decoder(value): DecoderResult<Array<ElementType> | "selectable"> {
    switch (value.type) {
      case "array":
        return array(ElementType).decoder(value.value);
      case "string":
        return stringUnion(["selectable"]).decoder(value.value);
    }
  },
  encoder: (value) =>
    Array.isArray(value)
      ? { type: "array" as const, value: array(ElementType).encoder(value) }
      : { type: "string" as const, value },
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
