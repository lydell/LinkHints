// @flow

export type KeyboardAction =
  | {|
      type: "Background",
      name: KeyboardActionBackground,
    |}
  | {|
      type: "Content",
      name: KeyboardActionContent,
    |};

export type KeyboardActionBackground = "EnterHintsModeGeneral";

export type KeyboardActionContent = "TODO";

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
