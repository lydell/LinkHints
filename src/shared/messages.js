// @flow strict-local

import type {
  ElementReport,
  ElementTypes,
  ElementWithHint,
  HintUpdate,
} from "./hints";
import type {
  KeyboardAction,
  KeyboardMapping,
  KeyboardMode,
  Keypress,
} from "./keyboard";
import type { Box, LogLevel } from "./main";
import type { Durations, Perf } from "./perf";

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
      type: "NonKeyboardShortcutKeypress",
      keypress: Keypress,
      timestamp: number,
    |}
  | {|
      type: "Keyup",
      keypress: Keypress,
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
      type: "ReportUpdatedElements",
      elements: Array<ElementReport>,
      rects: Array<Box>,
    |}
  | {|
      type: "ReportTextRects",
      rects: Array<Box>,
    |}
  | {|
      type: "Interaction",
    |}
  | {|
      type: "ClickedElementRemoved",
    |}
  | {|
      type: "ClickedLinkNavigatingToOtherPage",
    |}
  | {|
      type: "PageLeave",
    |}
  | {|
      type: "WindowBlur",
    |};

export type ToWorker =
  | {|
      type: "StateSync",
      logLevel: LogLevel,
      clearElements: boolean,
      keyboardShortcuts: Array<KeyboardMapping>,
      keyboardMode: KeyboardMode,
      ignoreKeyboardLayout: boolean,
      oneTimeWindowMessageToken: string,
    |}
  | {|
      type: "StartFindElements",
      types: ElementTypes,
    |}
  | {|
      type: "UpdateElements",
    |}
  | {|
      type: "GetTextRects",
      indexes: Array<number>,
      words: Array<string>,
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
    |}
  | {|
      type: "ReverseSelection",
    |}
  | {|
      type: "ClickFocusedElement",
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
      enteredTextChars: string,
    |}
  | {|
      type: "RotateHints",
      forward: boolean,
    |}
  | {|
      type: "RenderTextRects",
      rects: Array<Box>,
      frameId: number,
    |}
  | {|
      type: "SetTitle",
      title: string,
    |}
  | {|
      type: "Peek",
    |}
  | {|
      type: "Unpeek",
    |}
  | {|
      type: "Unrender",
      keepTitle: boolean,
    |};

export type FromPopup =
  | {|
      type: "PopupScriptAdded",
    |}
  | {|
      type: "ResetPerf",
    |};

export type ToPopup = {|
  type: "Init",
  logLevel: LogLevel,
  state:
    | {|
        type: "Normal",
        perf: Perf,
      |}
    | {|
        type: "Disabled",
      |},
|};
