import type {
  ElementRender,
  ElementReport,
  ElementTypes,
  HintUpdate,
} from "./hints";
import type {
  KeyboardAction,
  KeyboardMapping,
  KeyboardModeWorker,
  KeyTranslations,
  NormalizedKeypress,
} from "./keyboard";
import type { Box, LogLevel } from "./main";
import type { OptionsData, PartialOptions } from "./options";
import type { Durations, Stats, TabsPerf } from "./perf";

export type FromBackground =
  | {
      type: "FirefoxWorkaround";
    }
  | {
      type: "ToOptions";
      message: ToOptions;
    }
  | {
      type: "ToPopup";
      message: ToPopup;
    }
  | {
      type: "ToRenderer";
      message: ToRenderer;
    }
  | {
      type: "ToWorker";
      message: ToWorker;
    };

export type ToBackground =
  | {
      type: "FromOptions";
      message: FromOptions;
    }
  | {
      type: "FromPopup";
      message: FromPopup;
    }
  | {
      type: "FromRenderer";
      message: FromRenderer;
    }
  | {
      type: "FromWorker";
      message: FromWorker;
    };

export type FromWorker =
  | {
      type: "ClickedLinkNavigatingToOtherPage";
    }
  | {
      type: "KeyboardShortcutMatched";
      action: KeyboardAction;
      timestamp: number;
    }
  | {
      type: "KeypressCaptured";
      keypress: NormalizedKeypress;
    }
  | {
      type: "NonKeyboardShortcutKeypress";
      keypress: NormalizedKeypress;
      timestamp: number;
    }
  | {
      type: "OpenNewTabs";
      urls: Array<string>;
    }
  | {
      type: "PersistedPageShow";
    }
  | {
      type: "ReportTextRects";
      rects: Array<Box>;
    }
  | {
      type: "ReportUpdatedElements";
      elements: Array<ElementReport>;
      rects: Array<Box>;
    }
  | {
      type: "ReportVisibleElements";
      elements: Array<ElementReport>;
      numFrames: number;
      stats: Stats;
    }
  | {
      type: "ReportVisibleFrame";
    }
  | {
      type: "TopPageHide";
    }
  | {
      type: "WorkerScriptAdded";
    };

export type ToWorker =
  | {
      type: "ClickElement";
      index: number;
    }
  | {
      type: "CopyElement";
      index: number;
    }
  | {
      type: "Escape";
    }
  | {
      type: "FocusElement";
      index: number;
    }
  | {
      type: "GetTextRects";
      indexes: Array<number>;
      words: Array<string>;
    }
  | {
      type: "OpenNewTab";
      url: string;
      foreground: boolean;
    }
  | {
      type: "ReverseSelection";
    }
  | {
      type: "SelectElement";
      index: number;
    }
  | {
      type: "StartFindElements";
      types: ElementTypes;
    }
  | {
      type: "StateSync";
      logLevel: LogLevel;
      clearElements: boolean;
      keyboardShortcuts: Array<KeyboardMapping>;
      keyboardMode: KeyboardModeWorker;
      keyTranslations: KeyTranslations;
      oneTimeWindowMessageToken: string;
      mac: boolean;
      isPinned: boolean;
    }
  | {
      type: "UpdateElements";
    };

export type FromRenderer =
  | {
      type: "Rendered";
      durations: Durations;
      firstPaintTimestamp: number;
      lastPaintTimestamp: number;
    }
  | {
      type: "RendererScriptAdded";
    };

export type ToRenderer =
  | {
      type: "Peek";
    }
  | {
      type: "RemoveShruggie";
    }
  | {
      type: "Render";
      elements: Array<ElementRender>;
      mixedCase: boolean;
    }
  | {
      type: "RenderTextRects";
      rects: Array<Box>;
      frameId: number;
    }
  | {
      type: "RotateHints";
      forward: boolean;
    }
  | {
      type: "StateSync";
      css: string;
      logLevel: LogLevel;
    }
  | {
      type: "Unpeek";
    }
  | {
      type: "Unrender";
    }
  | {
      type: "UpdateHints";
      updates: Array<HintUpdate>;
      enteredText: string;
    };

export type FromPopup = {
  type: "PopupScriptAdded";
};

export type ToPopup = {
  type: "Init";
  logLevel: LogLevel;
  isEnabled: boolean;
};

export type FromOptions =
  | {
      type: "OptionsScriptAdded";
    }
  | {
      type: "ResetOptions";
    }
  | {
      type: "ResetPerf";
    }
  | {
      type: "SaveOptions";
      partialOptions: PartialOptions;
    }
  | {
      type: "ToggleKeyboardCapture";
      capture: boolean;
    };

export type ToOptions =
  | {
      type: "KeypressCaptured";
      keypress: NormalizedKeypress;
    }
  | {
      type: "PerfUpdate";
      perf: TabsPerf;
    }
  | {
      type: "StateSync";
      logLevel: LogLevel;
      options: OptionsData;
    };
