// @flow

// TODO: Move these types somewhere.
import type { ElementType, HintMeasurements } from "../worker/ElementManager";
import type { LogLevel } from "../shared/main";

import type {
  KeyboardAction,
  KeyboardMapping,
  KeyboardOptions,
  KeyboardShortcut,
} from "./KeyboardShortcuts";

export type FromBackground =
  | {|
      type: "ToWorker",
      message: ToWorker,
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
      type: "FromWorker",
      message: FromWorker,
    |}
  | {|
      type: "FromRenderer",
      message: FromRenderer,
    |}
  | {|
      type: "FromPopup",
      message: FromPopup,
    |};

export type FromWorker =
  | {|
      type: "WorkerScriptAdded",
    |}
  | {|
      type: "KeyboardShortcutMatched",
      action: KeyboardAction,
      timestamp: number,
    |}
  | {|
      type: "NonKeyboardShortcutMatched",
      shortcut: KeyboardShortcut,
    |}
  | {|
      type: "ReportVisibleElements",
      elements: Array<ElementReport>,
      pendingFrames: number,
    |};

export type ToWorker =
  | {|
      type: "StateSync",
      logLevel: LogLevel,
      clearElements: boolean,
      keyboardShortcuts: Array<KeyboardMapping>,
      keyboardOptions: KeyboardOptions,
      oneTimeWindowMessageToken: string,
    |}
  | {|
      type: "StartFindElements",
      types: Array<ElementType>,
    |}
  | {|
      type: "FocusElement",
      index: number,
    |}
  | {|
      type: "ClickElement",
      index: number,
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
      type: "StateSync",
      logLevel: LogLevel,
    |}
  | {|
      type: "Render",
      elements: Array<ElementWithHint>,
    |}
  | {|
      type: "UpdateHints",
      updates: Array<HintUpdate>,
      markMatched: boolean,
    |}
  | {|
      type: "Unrender",
      delayed: boolean,
    |};

export type FromPopup = {|
  type: "PopupScriptAdded",
|};

export type ToPopup = {|
  type: "PopupData",
  logLevel: LogLevel,
  data: ?{|
    perf: Array<number>,
  |},
|};

export type ElementReport = {|
  type: ElementType,
  index: number,
  hintMeasurements: HintMeasurements,
  url: ?string,
|};

export type ExtendedElementReport = {|
  ...ElementReport,
  frameId: number,
|};

export type ElementWithHint = {|
  ...ExtendedElementReport,
  weight: number,
  hint: string,
|};

export type HintUpdate =
  | {|
      type: "Hide",
    |}
  | {|
      type: "Update",
      matched: string,
      rest: string,
    |};
