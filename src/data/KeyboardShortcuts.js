// @flow

export type KeyboardAction =
  | {|
      type: "EnterHintsMode",
    |}
  | {|
      type: "ExitHintsMode",
    |}
  | {|
      type: "PressHintChar",
      char: string,
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
