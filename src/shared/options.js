// @flow strict-local

import {
  array,
  boolean,
  dict,
  map,
  mixedDict,
  number,
  repr,
  string,
} from "tiny-decoders";

import {
  type KeyPair,
  type KeyboardMapping,
  EN_US_QWERTY_TRANSLATIONS,
  decodeKeyPair,
  decodeKeyboardMapping,
} from "./keyboard";
import { type LogLevel, DEFAULT_LOG_LEVEL, decodeLogLevel } from "./main";

type Shortcuts = { [string]: Array<KeyboardMapping> };

const decodeShortcuts: mixed => Shortcuts = dict(array(decodeKeyboardMapping));

export function flattenShortcuts(shortcuts: Shortcuts): Array<KeyboardMapping> {
  return [].concat(...Object.keys(shortcuts).map(key => shortcuts[key]));
}

export type Options = {|
  chars: string,
  autoActivate: boolean,
  overTypingDuration: number,
  css: string,
  logLevel: LogLevel,
  useKeyTranslations: boolean,
  // The following options have shortened names so that the keys don’t get super
  // long after flattening. More descriptive names would be `keyTranslations`,
  // `globalKeyboardShortcuts`, etc.
  keys: { [string]: KeyPair },
  global: Shortcuts,
  normal: Shortcuts,
  hints: Shortcuts,
|};

export type PartialOptions = $Shape<Options>;

export const makeOptionsDecoder: (
  defaults: Options
) => mixed => [
  Options,
  Array<[string, Error]>,
] = recordWithDefaultsAndErrors.bind(undefined, {
  chars: string,
  autoActivate: boolean,
  overTypingDuration: number,
  css: string,
  logLevel: map(string, decodeLogLevel),
  useKeyTranslations: boolean,
  keys: dict(decodeKeyPair),
  global: decodeShortcuts,
  normal: decodeShortcuts,
  hints: decodeShortcuts,
});

export function getDefaults({ mac }: {| mac: boolean |}): Options {
  return {
    chars: "fjdkslaurieowhgmvcn",
    autoActivate: true,
    // This is the "prevent overtyping" timeout from VimFx.
    overTypingDuration: 400, // ms
    css: "",
    logLevel: DEFAULT_LOG_LEVEL,
    useKeyTranslations: false,
    keys: EN_US_QWERTY_TRANSLATIONS,
    global: {
      Escape: [
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
    },
    normal: {
      EnterHintsMode_Click: [
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
      ],
      EnterHintsMode_BackgroundTab: [
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
      ],
      EnterHintsMode_ForegroundTab: [
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
      ],
      EnterHintsMode_ManyClick: [
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
      ],
      EnterHintsMode_ManyTab: [
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
      ],
      EnterHintsMode_Select: [
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
      ],
      ReverseSelection: [
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
      ],
      ClickFocusedElement: [
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
    },
    hints: {
      ExitHintsMode: [
        {
          keypress: {
            key: "Escape",
            code: "Escape",
            alt: false,
            cmd: false,
            ctrl: false,
            shift: false,
          },
          action: {
            type: "ExitHintsMode",
          },
        },
      ],
      ActivateHint: [
        {
          keypress: {
            key: "Enter",
            code: "Enter",
            alt: false,
            cmd: false,
            ctrl: false,
            shift: false,
          },
          action: {
            type: "ActivateHint",
            alt: false,
          },
        },
      ],
      ActivateHint_Alt: [
        {
          keypress: {
            key: "Enter",
            code: "Enter",
            alt: true,
            cmd: false,
            ctrl: false,
            shift: false,
          },
          action: {
            type: "ActivateHint",
            alt: true,
          },
        },
      ],
      Backspace: [
        {
          keypress: {
            key: "Backspace",
            code: "Backspace",
            alt: false,
            cmd: false,
            ctrl: false,
            shift: false,
          },
          action: {
            type: "Backspace",
          },
        },
      ],
      RotateHints_Forward: [
        {
          keypress: {
            key: "Tab",
            code: "Tab",
            alt: false,
            cmd: false,
            ctrl: false,
            shift: false,
          },
          action: {
            type: "RotateHints",
            forward: true,
          },
        },
      ],
      RotateHints_Backward: [
        {
          keypress: {
            key: "Tab",
            code: "Tab",
            alt: false,
            cmd: false,
            ctrl: false,
            shift: true,
          },
          action: {
            type: "RotateHints",
            forward: false,
          },
        },
      ],
      RefreshHints: [
        {
          keypress: {
            key: "r",
            code: "KeyR",
            alt: false,
            cmd: mac,
            ctrl: !mac,
            shift: false,
          },
          action: {
            type: "RefreshHints",
          },
        },
      ],
    },
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

// Flatten nested objects by joining keys with ".". This assumes that no keys
// already contains a ".".
export function flattenObject(
  // Flow complains on `flattenObject(options)` if using this:
  // object: { [string]: mixed },
  object: {},
  parents?: Array<string> = []
): { [string]: mixed } {
  return Object.entries(object).reduce((result, [key, value]) => {
    if (typeof value === "object" && value != null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, parents.concat(key)));
    } else {
      result[parents.concat(key).join(".")] = value;
    }
    return result;
  }, {});
}

// Unflatten a flat object by splitting keys on ".".
export function unflattenObject(object: {
  [string]: mixed,
}): [{ [string]: mixed }, Array<Error>] {
  return Object.entries(object).reduce(
    ([result, errors], [key, value]) => {
      try {
        setDeep(result, key.split("."), value);
      } catch (error) {
        return [result, errors.concat(error)];
      }
      return [result, errors];
    },
    [{}, []]
  );
}

function setDeep(
  object: { [string]: mixed },
  path: Array<string>,
  value: mixed,
  index?: number = 0
) {
  const lastIndex = path.length - 1;
  if (index === lastIndex) {
    object[path[index]] = value;
  } else if (index >= 0 && index < lastIndex) {
    const key = path[index];
    if (!{}.hasOwnProperty.call(object, key)) {
      object[key] = {};
    }
    const child = object[key];
    if (typeof child === "object" && child != null && !Array.isArray(child)) {
      setDeep(child, path, value, index + 1);
    } else {
      throw new TypeError(
        `Cannot set \`.${path.join(".")}\` to ${repr(
          value
        )}: Expected \`.${path
          .slice(0, index + 1)
          .join(".")}\` to be an object, but got: ${repr(child)}`
      );
    }
  }
}
