// @flow

import type { KeyboardMapping } from "./KeyboardShortcuts";

export type FromAllFrames = {|
  type: "AllFramesScriptAdded",
|};

export type ToAllFrames = {|
  type: "StateSync",
  keyboardShortcuts: Array<KeyboardMapping>,
|};

export type FromTopFrame = {|
  type: "TODO",
|};

export type ToTopFrame = {|
  type: "TODO",
|};
