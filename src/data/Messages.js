// @flow

// TODO: Move these types somewhere.
import type { Durations, LogLevel, TimeTracker } from "../shared/main";
import type {
  ElementType,
  ElementTypes,
  HintMeasurements,
} from "../worker/ElementManager";

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
      timestamp: number,
    |}
  | {|
      type: "ReportVisibleFrame",
    |}
  | {|
      type: "ReportVisibleElements",
      elements: Array<ElementReport>,
      numFrames: number,
      durations: Durations,
    |}
  | {|
      type: "Interaction",
    |}
  | {|
      type: "ClickedElementRemoved",
    |}
  | {|
      type: "PageLeave",
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
      types: ElementTypes,
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
      type: "SelectElement",
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
      durations: Durations,
      firstPaintTimestamp: number,
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
      markMatched: boolean,
    |};

export type TabState = {|
  hintsState: HintsState,
  perf: Array<{|
    timeToFirstPaint: number,
    topDurations: Durations,
    collectDurations: Array<{| url: string, durations: Durations |}>,
    renderDurations: Durations,
  |}>,
|};

export type HintsState =
  | {|
      type: "Idle",
    |}
  | {|
      type: "Collecting",
      mode: HintsMode,
      pendingElements: PendingElements,
      startTime: number,
      time: TimeTracker,
      durations: Array<{| url: string, durations: Durations |}>,
      timeoutId: ?TimeoutID,
    |}
  | {|
      type: "Hinting",
      mode: HintsMode,
      startTime: number,
      time: TimeTracker,
      durations: Array<{| url: string, durations: Durations |}>,
      enteredHintChars: string,
      elementsWithHints: Array<ElementWithHint>,
    |};

export type PendingElements = {|
  pendingFrames: {|
    answering: number,
    collecting: number,
  |},
  elements: Array<ExtendedElementReport>,
|};
