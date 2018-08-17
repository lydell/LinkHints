// @flow

import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import BackgroundProgram from "./Program";

const globalKeyboardShortcuts: Array<KeyboardMapping> = [
  {
    shortcut: {
      key: "Escape",
      code: "Escape",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: { type: "Escape" },
  },
];

const normalKeyboardShortcuts: Array<KeyboardMapping> = [
  ...globalKeyboardShortcuts,
  {
    shortcut: {
      key: "j",
      code: "KeyJ",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Click",
    },
  },
  {
    shortcut: {
      key: "h",
      code: "KeyH",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Click",
    },
  },
  {
    shortcut: {
      key: "k",
      code: "KeyK",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "BackgroundTab",
    },
  },
  {
    shortcut: {
      key: "t",
      code: "KeyT",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "BackgroundTab",
    },
  },
  {
    shortcut: {
      key: "l",
      code: "KeyL",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ForegroundTab",
    },
  },
  {
    shortcut: {
      key: "r",
      code: "KeyR",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ForegroundTab",
    },
  },
];

const hintsKeyboardShortcuts: Array<KeyboardMapping> = [
  ...globalKeyboardShortcuts,
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
];

const program = new BackgroundProgram({
  normalKeyboardShortcuts,
  hintsKeyboardShortcuts,
  hintChars: "fjdkslaghrueiwoncmv",
});

program.start();

// Attach the instance to the background page's `window` for debugging. This
// means one can type `program` in the console opened from `about:debugging` or
// `chrome://extensions` to look at the current state of things.
window.program = program;
