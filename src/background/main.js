// @flow

import type { KeyboardMapping } from "../shared/keyboard";

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
  {
    shortcut: {
      key: "J",
      code: "KeyJ",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyClick",
    },
  },
  {
    shortcut: {
      key: "H",
      code: "KeyH",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyClick",
    },
  },
  {
    shortcut: {
      key: "K",
      code: "KeyK",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyTab",
    },
  },
  {
    shortcut: {
      key: "T",
      code: "KeyT",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyTab",
    },
  },
  {
    shortcut: {
      key: "L",
      code: "KeyL",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Select",
    },
  },
  {
    shortcut: {
      key: "R",
      code: "KeyR",
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Select",
    },
  },
  {
    shortcut: {
      key: "ArrowUp",
      code: "ArrowUp",
      // TODO: Use ctrl instead of alt on mac.
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: {
      type: "ReverseSelection",
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
  {
    shortcut: {
      key: "Tab",
      code: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    },
    action: { type: "RotateHints", forward: true },
  },
  {
    shortcut: {
      key: "Tab",
      code: "Tab",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: true,
    },
    action: { type: "RotateHints", forward: false },
  },
  {
    shortcut: {
      key: "r",
      code: "KeyR",
      altKey: false,
      // TODO: Use cmd instead of ctrl on mac.
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
    },
    action: { type: "RefreshHints" },
  },
];

const program = new BackgroundProgram({
  normalKeyboardShortcuts,
  hintsKeyboardShortcuts,
  hints: {
    // chars: "fjdkslaghrueiwoncmv",
    chars: "ehstirnoamupcwlfgdy",
    autoActivate: true,
    // This is the "prevent overtyping" timeout from VimFx.
    timeout: 400, // ms
  },
});

program.start();

// Attach the instance to the background page's `window` for debugging. This
// means one can type `program` in the console opened from `about:debugging` or
// `chrome://extensions` to look at the current state of things.
window.program = program;
