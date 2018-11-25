// @flow strict-local

import { array, boolean, number, record, string } from "tiny-decoders";

import {
  type KeyboardMapping,
  decodeKeyboardMapping,
} from "../shared/keyboard";
import { log } from "../shared/main";

export type Options = {|
  ignoreKeyboardLayout: boolean,
  hintsChars: string,
  hintsAutoActivate: boolean,
  hintsTimeout: number,
  globalKeyboardShortcuts: Array<KeyboardMapping>,
  normalKeyboardShortcuts: Array<KeyboardMapping>,
  hintsKeyboardShortcuts: Array<KeyboardMapping>,
|};

function makeOptionsDecoder(defaults: Options): mixed => Options {
  return record({
    ignoreKeyboardLayout: tryWithDefault(
      boolean,
      defaults.ignoreKeyboardLayout
    ),
    hintsChars: tryWithDefault(string, defaults.hintsChars),
    hintsAutoActivate: tryWithDefault(boolean, defaults.hintsAutoActivate),
    hintsTimeout: tryWithDefault(number, defaults.hintsTimeout),
    globalKeyboardShortcuts: tryWithDefault(
      array(decodeKeyboardMapping),
      defaults.globalKeyboardShortcuts
    ),
    normalKeyboardShortcuts: tryWithDefault(
      array(decodeKeyboardMapping),
      defaults.normalKeyboardShortcuts
    ),
    hintsKeyboardShortcuts: tryWithDefault(
      array(decodeKeyboardMapping),
      defaults.hintsKeyboardShortcuts
    ),
  });
}

function tryWithDefault<T, U>(
  decoder: mixed => T,
  defaultValue: U
): mixed => T | U {
  return function tryWithDefaultDecoder(value: mixed): T | U {
    try {
      return decoder(value);
    } catch (error) {
      log("error", "Failed to decode option", error);
      return defaultValue;
    }
  };
}

export function getDefaults({ mac }: {| mac: boolean |}): Options {
  return {
    ignoreKeyboardLayout: true,
    hintsChars: "fjdkslaghrueiwoncmv",
    hintsAutoActivate: true,
    // This is the "prevent overtyping" timeout from VimFx.
    hintsTimeout: 400, // ms
    globalKeyboardShortcuts: [
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
    ],
    normalKeyboardShortcuts: [
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
          key: "ArrowUp",
          code: "ArrowUp",
          alt: !mac,
          cmd: false,
          ctrl: mac,
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
          ctrl: true,
          shift: false,
        },
        action: {
          type: "ClickFocusedElement",
        },
      },
    ],
    hintsKeyboardShortcuts: [
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
          cmd: mac,
          ctrl: !mac,
          shift: false,
        },
        action: { type: "RefreshHints" },
      },
    ],
  };
}

export function decodeOptions(value: mixed, defaults: Options): Options {
  const decoder = makeOptionsDecoder(defaults);
  return decoder(value);
}
