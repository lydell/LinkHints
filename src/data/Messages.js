// @flow

// TODO: Move these types somewhere.
import type { ElementType, HintMeasurements } from "../worker/ElementManager";
import type { LogLevel } from "../shared/main";

import type {
  HintsMode,
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
    |}
  | {|
      type: "FirefoxWorkaround",
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
      type: "ReportVisibleFrame",
    |}
  | {|
      type: "ReportVisibleElements",
      elements: Array<ElementReport>,
      numFrames: number,
    |}
  | {|
      type: "Interaction",
    |}
  | {|
      type: "ClickedElementRemoved",
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
      trackRemoval: boolean,
    |}
  | {|
      type: "OpenNewTab",
      url: string,
      foreground: boolean,
    |}
  | {|
      type: "Escape",
    |}
  | {|
      type: "TrackInteractions",
      track: boolean,
    |};

export type FromRenderer =
  | {|
      type: "RendererScriptAdded",
    |}
  | {|
      type: "Rendered",
      timestamps: Timestamps,
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
      type: "RotateHints",
      forward: boolean,
    |}
  | {|
      type: "Unrender",
      mode:
        | {| type: "immediate" |}
        | {| type: "delayed" |}
        | {| type: "title", title: string |},
    |};

export type FromPopup =
  | {|
      type: "PopupScriptAdded",
    |}
  | {|
      type: "ResetPerf",
    |};

export type ToPopup = {|
  type: "PopupData",
  logLevel: LogLevel,
  data: ?{|
    tabId: number,
    tabState: TabState,
  |},
|};

export type ElementReport = {|
  type: ElementType,
  index: number,
  hintMeasurements: HintMeasurements,
  url: ?string,
  title: ?string,
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

export type TabState = {|
  hintsState: HintsState,
  perf: Array<{| startTime: number, timestamps: Timestamps |}>,
|};

export type HintsState =
  | {|
      type: "Idle",
    |}
  | {|
      type: "Collecting",
      mode: HintsMode,
      pendingElements: PendingElements,
      timeoutId: ?TimeoutID,
    |}
  | {|
      type: "Hinting",
      mode: HintsMode,
      startTime: number,
      enteredHintChars: string,
      elementsWithHints: Array<ElementWithHint>,
    |};

export type PendingElements = {|
  pendingFrames: {|
    answering: number,
    collecting: number,
  |},
  startTime: number,
  elements: Array<ExtendedElementReport>,
|};

export type Timestamps = {|
  collect: number,
  prepare: number,
  render: number,
  moveInside1: number,
  paint1: number,
  moveInside2: number,
  paint2: number,
|};
