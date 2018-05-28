// @flow

// TODO: Move these types somewhere.
import type {
  ElementType,
  HintMeasurements,
} from "../allFrames/ElementManager";

import type { KeyboardAction, KeyboardMapping } from "./KeyboardShortcuts";

export type ToContent =
  | {|
      type: "ToAllFrames",
      message: ToAllFrames,
    |}
  | {|
      type: "ToTopFrame",
      message: ToTopFrame,
    |};

export type FromContent = FromAllFrames | FromTopFrame;

export type FromAllFrames =
  | {|
      type: "AllFramesScriptAdded",
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

export type ToAllFrames =
  | {|
      type: "StateSync",
      keyboardShortcuts: Array<KeyboardMapping>,
      suppressByDefault: boolean,
      oneTimeWindowMessageToken: string,
    |}
  | {|
      type: "StartFindElements",
    |};

export type FromTopFrame =
  | {|
      type: "TopFrameScriptAdded",
    |}
  | {|
      type: "Rendered",
      timestamp: number,
    |};

export type ToTopFrame =
  | {|
      type: "Render",
      elements: Array<ExtendedElementReport>,
    |}
  | {|
      type: "Unrender",
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
