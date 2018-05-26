// @flow

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

export type FromTopFrame = {|
  type: "TopFrameScriptAdded",
|};

export type ToTopFrame = {|
  type: "TODO",
|};
