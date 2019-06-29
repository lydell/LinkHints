// @flow

import * as React from "preact";

import { shortcuts } from "./KeyboardShortcuts";

const SHORTCUTS = [
  {
    shortcut: shortcuts.EnterHintsMode_Click,
    description: "Click links, buttons, etc.",
  },
  {
    shortcut: shortcuts.EnterHintsMode_BackgroundTab,
    description: "Open link in new tab.",
  },
  {
    shortcut: shortcuts.EnterHintsMode_ForegroundTab,
    description: "Open link in new tab and switch to it.",
  },
  {
    shortcut: shortcuts.EnterHintsMode_ManyClick,
    description: "Click many things.",
  },
  {
    shortcut: shortcuts.EnterHintsMode_ManyTab,
    description: "Open many links.",
  },
  {
    shortcut: shortcuts.EnterHintsMode_Select,
    description: "Select element.",
  },
];

export default function ShortcutsSummary() {
  return (
    <ul className="Shortcuts">
      {SHORTCUTS.map(({ shortcut, description }) => (
        <li key={description}>
          {shortcut}
          <span>{description}</span>
        </li>
      ))}
    </ul>
  );
}
