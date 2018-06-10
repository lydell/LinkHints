// @flow

export type KeyboardAction =
  | {|
      type: "EnterHintsMode",
    |}
  | {|
      type: "ExitHintsMode",
    |};

export type KeyboardShortcut = {|
  key: string,
  code: string,
  altKey: boolean,
  ctrlKey: boolean,
  metaKey: boolean,
  shiftKey: boolean,
|};

export type KeyboardMapping = {|
  shortcut: KeyboardShortcut,
  action: KeyboardAction,
|};

export type KeyboardOptions = {|
  capture: boolean,
  suppressByDefault: boolean,
  sendAll: boolean,
|};
