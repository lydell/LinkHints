// @flow

import type { KeyboardMapping } from "../data/KeyboardShortcuts";

import BackgroundProgram from "./Program";

const normalKeyboardShortcuts: Array<KeyboardMapping> = [
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
];

const program = new BackgroundProgram({
  normalKeyboardShortcuts,
  hintsKeyboardShortcuts,
  hintChars,
});

program.start();
