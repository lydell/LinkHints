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

export type ToAllFrames = {|
  type: "StateSync",
  keyboardShortcuts: Array<KeyboardMapping>,
  suppressByDefault: boolean,
|};

export type FromTopFrame = {|
  type: "TODO",
|};

export type ToTopFrame = {|
  type: "TODO",
|};
