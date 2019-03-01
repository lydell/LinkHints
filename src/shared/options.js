// @flow strict-local

import { array, boolean, map, mixedDict, number, string } from "tiny-decoders";

import { type KeyboardMapping, decodeKeyboardMapping } from "./keyboard";
import { type LogLevel, DEFAULT_LOG_LEVEL, decodeLogLevel } from "./main";

export type Options = {|
  ignoreKeyboardLayout: boolean,
  hintsChars: string,
  hintsAutoActivate: boolean,
  hintsTimeout: number,
  css: string,
  logLevel: LogLevel,
  globalKeyboardShortcuts: Array<KeyboardMapping>,
  normalKeyboardShortcuts: Array<KeyboardMapping>,
  hintsKeyboardShortcuts: Array<KeyboardMapping>,
|};

export type PartialOptions = $Shape<Options>;

export const makeOptionsDecoder: (
  defaults: Options
) => mixed => [
  Options,
  Array<[string, Error]>,
] = recordWithDefaultsAndErrors.bind(undefined, {
  ignoreKeyboardLayout: boolean,
  hintsChars: string,
  hintsAutoActivate: boolean,
  hintsTimeout: number,
  css: string,
  logLevel: map(string, decodeLogLevel),
  globalKeyboardShortcuts: array(decodeKeyboardMapping),
  normalKeyboardShortcuts: array(decodeKeyboardMapping),
  hintsKeyboardShortcuts: array(decodeKeyboardMapping),
});

export function getDefaults({ mac }: {| mac: boolean |}): Options {
  return {
    ignoreKeyboardLayout: true,
    hintsChars: "fjdkslaurieowhgmvcn",
    hintsAutoActivate: true,
    // This is the "prevent overtyping" timeout from VimFx.
    hintsTimeout: 400, // ms
    css: "",
    logLevel: DEFAULT_LOG_LEVEL,
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

type ExtractDecoderType = <T, U>((mixed) => T | U) => T | U;

export function recordWithDefaultsAndErrors<T: {}>(
  mapping: T,
  defaults: $ObjMap<T, ExtractDecoderType>
): mixed => [$ObjMap<T, ExtractDecoderType>, Array<[string, Error]>] {
  return function recordWithDefaultsAndErrorsDecoder(
    value: mixed
  ): [$ObjMap<T, ExtractDecoderType>, Array<[string, Error]>] {
    const obj = mixedDict(value);
    const keys = Object.keys(mapping);
    const result = {};
    const errors = [];
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      const decoder = mapping[key];
      try {
        result[key] = decoder(obj[key]);
      } catch (error) {
        result[key] = defaults[key];
        errors.push([key, error]);
      }
    }
    return [result, errors];
  };
}
