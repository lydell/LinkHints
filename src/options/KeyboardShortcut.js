// @flow strict-local

import * as React from "preact";

import { type Shortcut } from "../shared/keyboard";

type Props = {|
  mac: boolean,
  shortcut: Shortcut,
|};

export default function KeyboardShortcut({ mac, shortcut }: Props) {
  const { key } = shortcut;
  const isChar = key.length === 1;
  return (
    <span className="KeyboardShortcut">
      {shortcut.cmd && <kbd>{mac ? "⌘" : "Cmd"}</kbd>}
      {shortcut.ctrl && <kbd>{mac ? "^" : "Ctrl"}</kbd>}
      {shortcut.alt && <kbd>{mac ? "⌥" : "Alt"}</kbd>}
      {shortcut.shift &&
        (!isChar || key.toLowerCase() !== key.toUpperCase()) && (
          <kbd>{mac ? "⇧" : "Shift"}</kbd>
        )}
      {key !== "" && <kbd>{isChar ? key.toUpperCase() : key}</kbd>}
    </span>
  );
}
