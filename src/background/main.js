// @flow

import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import BackgroundProgram from "./program";

if (BROWSER === ("chrome": Browser)) {
  console.log("chrome!", browser);
} else if (BROWSER === ("firefox": Browser)) {
  console.log("firefox!", browser);
}

const normalKeyboardShortcuts: Array<KeyboardMapping> = [
  {
    shortcut: {
      key: "e",
      code: "KeyE",
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    },
    action: { type: "EnterHintsMode" },
  },
];

const hintChars = "fjdkslaghrueiwoncmv";

const hintsKeyboardShortcuts: Array<KeyboardMapping> = [
  {
    shortcut: {
      key: "Escape",
      code: "Escape",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: { type: "ExitHintsMode" },
  },
].concat(
  ...hintChars.split("").map(char => ({
    shortcut: {
      key: char,
      code: `Key${char.toUpperCase()}`,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: { type: "PressHintChar", char },
  }))
);

const program = new BackgroundProgram({
  normalKeyboardShortcuts,
  hintsKeyboardShortcuts,
});

program.start();
