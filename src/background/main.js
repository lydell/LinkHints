// @flow strict-local

import type { KeyboardMapping } from "../shared/keyboard";
import BackgroundProgram from "./Program";

const globalKeyboardShortcuts: Array<KeyboardMapping> = [
  {
    keypress: {
      key: "Escape",
      code: "Escape",
      alt: false,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: { type: "Escape" },
  },
];

const normalKeyboardShortcuts: Array<KeyboardMapping> = [
  ...globalKeyboardShortcuts,
  {
    keypress: {
      key: "j",
      code: "KeyJ",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Click",
    },
  },
  {
    keypress: {
      key: "h",
      code: "KeyH",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Click",
    },
  },
  {
    keypress: {
      key: "k",
      code: "KeyK",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "BackgroundTab",
    },
  },
  {
    keypress: {
      key: "t",
      code: "KeyT",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "BackgroundTab",
    },
  },
  {
    keypress: {
      key: "l",
      code: "KeyL",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ForegroundTab",
    },
  },
  {
    keypress: {
      key: "r",
      code: "KeyR",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ForegroundTab",
    },
  },
  {
    keypress: {
      key: "J",
      code: "KeyJ",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyClick",
    },
  },
  {
    keypress: {
      key: "H",
      code: "KeyH",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyClick",
    },
  },
  {
    keypress: {
      key: "K",
      code: "KeyK",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyTab",
    },
  },
  {
    keypress: {
      key: "T",
      code: "KeyT",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "ManyTab",
    },
  },
  {
    keypress: {
      key: "L",
      code: "KeyL",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Select",
    },
  },
  {
    keypress: {
      key: "R",
      code: "KeyR",
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "EnterHintsMode",
      mode: "Select",
    },
  },
  {
    keypress: {
      key: "ArrowUp",
      code: "ArrowUp",
      // TODO: Use ctrl instead of alt on mac.
      alt: true,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: {
      type: "ReverseSelection",
    },
  },
  {
    keypress: {
      key: " ",
      code: "Space",
      alt: true,
      cmd: false,
      // TODO: Use cmd instead of ctrl on mac?
      ctrl: true,
      shift: false,
    },
    action: {
      type: "ClickFocusedElement",
    },
  },
];

const hintsKeyboardShortcuts: Array<KeyboardMapping> = [
  ...globalKeyboardShortcuts,
  {
    keypress: {
      key: "Escape",
      code: "Escape",
      alt: false,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: { type: "ExitHintsMode" },
  },
  {
    keypress: {
      key: "Tab",
      code: "Tab",
      alt: false,
      cmd: false,
      ctrl: false,
      shift: false,
    },
    action: { type: "RotateHints", forward: true },
  },
  {
    keypress: {
      key: "Tab",
      code: "Tab",
      alt: false,
      cmd: false,
      ctrl: false,
      shift: true,
    },
    action: { type: "RotateHints", forward: false },
  },
  {
    keypress: {
      key: "r",
      code: "KeyR",
      alt: false,
      // TODO: Use cmd instead of ctrl on mac.
      cmd: false,
      ctrl: true,
      shift: false,
    },
    action: { type: "RefreshHints" },
  },
];

const program = new BackgroundProgram({
  normalKeyboardShortcuts,
  hintsKeyboardShortcuts,
  // ignoreKeyboardLayout: true,
  ignoreKeyboardLayout: false,
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
