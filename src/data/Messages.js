// @flow

// TODO: Move these types somewhere.
import type {
  ElementType,
  HintMeasurements,
} from "../observer/ElementManager";

import type { KeyboardAction, KeyboardMapping } from "./KeyboardShortcuts";

export type FromBackground =
  | {|
      type: "ToObserver",
      message: ToObserver,
    |}
  | {|
      type: "ToRenderer",
      message: ToRenderer,
    |}
  | {|
      type: "ToPopup",
      message: ToPopup,
    |};

export type ToBackground =
  | {|
      type: "FromObserver",
      message: FromObserver,
    |}
  | {|
      type: "FromRenderer",
      message: FromRenderer,
    |}
  | {|
      type: "FromPopup",
      message: FromPopup,
    |};

export type FromObserver =
  | {|
      type: "ObserverScriptAdded",
    |}
  | {|
      type: "KeyboardShortcutMatched",
      action: KeyboardAction,
      timestamp: number,
    |}
  | {|
      type: "ReportVisibleElements",
      elements: Array<ElementReport>,
      pendingFrames: number,
    |};

export type ToObserver =
  | {|
      type: "StateSync",
      keyboardShortcuts: Array<KeyboardMapping>,
      suppressByDefault: boolean,
      oneTimeWindowMessageToken: string,
    |}
  | {|
      type: "StartFindElements",
    |};

export type FromRenderer =
  | {|
      type: "RendererScriptAdded",
    |}
  | {|
      type: "Rendered",
      timestamp: number,
    |};

export type ToRenderer =
  | {|
      type: "Render",
      elements: Array<ExtendedElementReport>,
    |}
  | {|
      type: "Unrender",
    |};

export type FromPopup = {|
  type: "GetPerf",
|};

export type ToPopup = {|
  type: "TODO",
|};

export type ElementReport = {|
  type: ElementType,
  hintMeasurements: HintMeasurements,
  url: ?string,
|};

export type ExtendedElementReport = {|
  ...ElementReport,
  frameId: number,
|};
