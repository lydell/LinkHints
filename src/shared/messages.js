// @flow strict-local

import type {
  ElementReport,
  ElementTypes,
  ElementWithHint,
  HintUpdate,
} from "./hints";
import type {
  KeyTranslations,
  KeyboardAction,
  KeyboardMapping,
  KeyboardMode,
  NormalizedKeypress,
} from "./keyboard";
import type { Box, LogLevel } from "./main";
import type { OptionsData, PartialOptions } from "./options";
import type { Durations, Stats, TabsPerf } from "./perf";

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
      type: "ToOptions",
      message: ToOptions,
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
    |}
  | {|
      type: "FromOptions",
      message: FromOptions,
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
      keypress: NormalizedKeypress,
      timestamp: number,
    |}
  | {|
      type: "KeypressCaptured",
      keypress: NormalizedKeypress,
    |}
  | {|
      type: "ReportVisibleFrame",
    |}
  | {|
      type: "ReportVisibleElements",
      elements: Array<ElementReport>,
      numFrames: number,
      stats: Stats,
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
      keyTranslations: KeyTranslations,
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
    |}
  | {|
      type: "SelectElement",
      index: number,
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
      lastPaintTimestamp: number,
    |};

export type ToRenderer =
  | {|
      type: "StateSync",
      css: string,
      logLevel: LogLevel,
    |}
  | {|
      type: "Render",
      elements: Array<ElementWithHint>,
      mixedCase: boolean,
    |}
  | {|
      type: "UpdateHints",
      updates: Array<HintUpdate>,
      enteredText: string,
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
      type: "Peek",
    |}
  | {|
      type: "Unpeek",
    |}
  | {|
      type: "Unrender",
    |};

export type FromPopup = {|
  type: "PopupScriptAdded",
|};

export type ToPopup = {|
  type: "Init",
  logLevel: LogLevel,
  isEnabled: boolean,
|};

export type FromOptions =
  | {|
      type: "OptionsScriptAdded",
    |}
  | {|
      type: "SaveOptions",
      partialOptions: PartialOptions,
    |}
  | {|
      type: "ResetOptions",
    |}
  | {|
      type: "ResetPerf",
    |}
  | {|
      type: "ToggleKeyboardCapture",
      capture: boolean,
    |};

export type ToOptions =
  | {|
      type: "StateSync",
      logLevel: LogLevel,
      options: OptionsData,
    |}
  | {|
      type: "KeypressCaptured",
      keypress: NormalizedKeypress,
    |}
  | {|
      type: "PerfUpdate",
      perf: TabsPerf,
    |};
