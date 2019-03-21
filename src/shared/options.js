// @flow strict-local

import {
  boolean,
  dict,
  field,
  map,
  mixedArray,
  mixedDict,
  number,
  repr,
  string,
} from "tiny-decoders";

import {
  type KeyTranslations,
  type KeyboardMapping,
  EN_US_QWERTY_TRANSLATIONS,
  decodeKeyPair,
  decodeKeyboardMapping,
  decodeKeyboardMappingWithModifiers,
  deserializeShortcut,
  serializeShortcut,
} from "./keyboard";
import { type LogLevel, DEFAULT_LOG_LEVEL, decodeLogLevel } from "./main";

export type OptionsData = {|
  values: Options,
  defaults: Options,
  errors: Array<string>,
  mac: boolean,
|};

export type Options = {|
  chars: string,
  autoActivate: boolean,
  overTypingDuration: number,
  css: string,
  logLevel: LogLevel,
  useKeyTranslations: boolean,
  keyTranslations: KeyTranslations,
  normalKeyboardShortcuts: Array<KeyboardMapping>,
  hintsKeyboardShortcuts: Array<KeyboardMapping>,
|};

export type PartialOptions = $Shape<Options>;

export function makeOptionsDecoder(
  defaults: Options
): mixed => [Options, Array<[string, Error]>] {
  return map(
    recordWithDefaultsAndErrors(defaults, {
      chars: map(string, validateChars),
      autoActivate: boolean,
      overTypingDuration: map(number, nonNegativeInteger),
      css: string,
      logLevel: map(string, decodeLogLevel),
      useKeyTranslations: boolean,
      keyTranslations: dict(decodeKeyPair),
      normalKeyboardShortcuts: arrayWithErrors(
        decodeKeyboardMappingWithModifiers
      ),
      hintsKeyboardShortcuts: arrayWithErrors(decodeKeyboardMapping),
    }),
    ([
      { normalKeyboardShortcuts, hintsKeyboardShortcuts, ...options },
      errors,
    ]) => {
      const [normal, normalErrors] = separateMappingsAndErrors(
        "normalKeyboardShortcuts",
        normalKeyboardShortcuts
      );
      const [hints, hintsErrors] = separateMappingsAndErrors(
        "hintsKeyboardShortcuts",
        hintsKeyboardShortcuts
      );
      return [
        {
          ...options,
          normalKeyboardShortcuts: normal,
          hintsKeyboardShortcuts: hints,
        },
        errors.concat(normalErrors, hintsErrors),
      ];
    }
  );
}

function separateMappingsAndErrors(
  name: string,
  mappingsWithErrors: Array<KeyboardMapping | TypeError>
): [Array<KeyboardMapping>, Array<[string, Error]>] {
  const mappings: Array<KeyboardMapping> = [];
  const errors: Array<[string, Error]> = [];

  for (const [index, item] of mappingsWithErrors.entries()) {
    if (item instanceof TypeError) {
      errors.push([`${name}[${index}]`, item]);
    } else {
      mappings.push(item);
    }
  }

  return [mappings, errors];
}

const MIN_CHARS = 2;

function validateChars(chars: string): string {
  if (/\s/.test(chars)) {
    throw new TypeError(
      `Expected chars not to contain whitespace, but got: ${repr(chars)}`
    );
  }

  const match = /(.)(?=.*\1)/.exec(chars);
  if (match != null) {
    throw new TypeError(
      `Expected chars not to contain duplicate characters, but got ${repr(
        match[1]
      )} more than once.`
    );
  }

  if (chars.length < MIN_CHARS) {
    throw new TypeError(
      `Expected at least ${repr(MIN_CHARS)} chars, but got: ${repr(
        chars.length
      )}`
    );
  }

  return chars;
}

export function normalizeChars(chars: string, defaultValue: string): string {
  const unique = pruneChars(chars);
  return unique.length >= MIN_CHARS
    ? unique
    : unique.length === 0
    ? defaultValue
    : pruneChars(unique + defaultValue).slice(0, MIN_CHARS);
}

function pruneChars(chars: string): string {
  return Array.from(new Set(Array.from(chars.replace(/\s/g, "")))).join("");
}

function nonNegativeInteger(value: number): number {
  if (!(Number.isInteger(value) && value >= 0)) {
    throw new TypeError(
      `Expected a non-negative integer, but got: ${repr(value)}`
    );
  }
  return value;
}

export function normalizeNonNegativeInteger(
  value: string,
  defaultValue: number
): string {
  const parsed = Math.max(0, Math.round(parseFloat(value)));
  return String(Number.isFinite(parsed) ? parsed : defaultValue);
}

export function getDefaults({ mac }: {| mac: boolean |}): Options {
  return {
    chars: "fjdkslaurieowhgmvcn",
    autoActivate: true,
    // This is the "prevent overtyping" timeout from VimFx.
    overTypingDuration: 400, // ms
    css: "",
    logLevel: DEFAULT_LOG_LEVEL,
    useKeyTranslations: false,
    keyTranslations: EN_US_QWERTY_TRANSLATIONS,
    normalKeyboardShortcuts: [
      {
        shortcut: {
          key: "j",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "EnterHintsMode_Click",
      },
      {
        shortcut: {
          key: "k",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "EnterHintsMode_BackgroundTab",
      },
      {
        shortcut: {
          key: "l",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "EnterHintsMode_ForegroundTab",
      },
      {
        shortcut: {
          key: "J",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "EnterHintsMode_ManyClick",
      },
      {
        shortcut: {
          key: "K",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "EnterHintsMode_ManyTab",
      },
      {
        shortcut: {
          key: "L",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "EnterHintsMode_Select",
      },
      {
        shortcut: {
          key: "ArrowUp",
          alt: !mac,
          cmd: false,
          ctrl: mac,
          shift: true,
        },
        action: "ReverseSelection",
      },
      {
        shortcut: {
          key: "Space",
          alt: true,
          cmd: false,
          ctrl: true,
          shift: false,
        },
        action: "ClickFocusedElement",
      },
      {
        shortcut: {
          key: "Escape",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "Escape",
      },
    ],
    hintsKeyboardShortcuts: [
      {
        shortcut: {
          key: "Enter",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "ActivateHint",
      },
      {
        shortcut: {
          key: "Enter",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "ActivateHintAlt",
      },
      {
        shortcut: {
          key: "Backspace",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "Backspace",
      },
      {
        shortcut: {
          key: "Tab",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "RotateHintsForward",
      },
      {
        shortcut: {
          key: "Tab",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "RotateHintsBackward",
      },
      {
        shortcut: {
          key: "r",
          alt: false,
          cmd: mac,
          ctrl: !mac,
          shift: false,
        },
        action: "RefreshHints",
      },
      {
        shortcut: {
          key: "p",
          alt: false,
          cmd: mac,
          ctrl: !mac,
          shift: false,
        },
        action: "TogglePeek",
      },
      {
        shortcut: {
          key: "Escape",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "ExitHintsMode",
      },
      {
        shortcut: {
          key: "Escape",
          alt: false,
          cmd: false,
          ctrl: false,
          shift: true,
        },
        action: "Escape",
      },
    ],
  };
}

type ExtractDecoderType = <T, U>((mixed) => T | U) => T | U;

function recordWithDefaultsAndErrors<T: {}>(
  defaults: $ObjMap<T, ExtractDecoderType>,
  mapping: T
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

function arrayWithErrors<T>(
  decoder: mixed => T
): mixed => Array<T | TypeError> {
  return function arrayWithErrorsDecoder(value: mixed): Array<T | TypeError> {
    const arr = mixedArray(value);
    const result = [];
    for (let index = 0; index < arr.length; index++) {
      try {
        result.push(field(index, decoder)(arr));
      } catch (error) {
        result.push(error);
      }
    }
    return result;
  };
}

export function flattenOptions(options: PartialOptions): { [string]: mixed } {
  const {
    keyTranslations,
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
    ...rest
  } = options;

  return {
    ...rest,
    ...(keyTranslations != null
      ? flattenKeyTranslations(keyTranslations, "keys")
      : {}),
    ...(normalKeyboardShortcuts != null
      ? flattenKeyboardMappings(normalKeyboardShortcuts, "normal")
      : {}),
    ...(hintsKeyboardShortcuts != null
      ? flattenKeyboardMappings(hintsKeyboardShortcuts, "hints")
      : {}),
  };
}

function flattenKeyTranslations(
  keyTranslations: KeyTranslations,
  prefix: string
): { [string]: mixed } {
  const keys = Object.keys(keyTranslations);
  // Distinguish between no translations set, and all of them removed.
  return keys.length > 0
    ? keys.reduce((result, code) => {
        result[`${prefix}.${code}`] = keyTranslations[code];
        return result;
      }, {})
    : { [prefix]: null };
}

function flattenKeyboardMappings(
  mappings: Array<KeyboardMapping>,
  prefix: string
): { [string]: mixed } {
  // Distinguish between no mappings set, and all of them removed.
  return mappings.length > 0
    ? mappings.reduce((result, mapping) => {
        result[`${prefix}.${serializeShortcut(mapping.shortcut)}`] =
          mapping.action;
        return result;
      }, {})
    : { [prefix]: null };
}

const PREFIX_REGEX = /([^.]+)\.([^]*)/;

// This takes a flat object and turns it into an object that can be fed to
// `makeOptionsDecoder`.
export function unflattenOptions(object: {
  [string]: mixed,
}): { [string]: mixed } {
  const options = {};

  function set(parent: string, key: string, value: mixed) {
    if (!(typeof options[parent] === "object" && options[parent] != null)) {
      options[parent] = {};
    }
    // `"keys": null`, for example, indicates that all `keyTranslations` have
    // been removed.
    if (!(key === "" && value === null)) {
      options[parent][key] = value;
    }
  }

  function pushShortcut(parent: string, key: string, value: mixed) {
    if (!Array.isArray(options[parent])) {
      options[parent] = [];
    }
    // `"normal": null`, for example, indicates that all
    // `normalKeyboardShortcuts` have been removed.
    if (!(key === "" && value === null)) {
      options[parent].push({
        shortcut: deserializeShortcut(key),
        action: value,
      });
    }
  }

  for (const key of Object.keys(object)) {
    const item = object[key];
    const [, start, rest] = PREFIX_REGEX.exec(key) || ["", key, ""];

    switch (start) {
      case "keys":
        set("keyTranslations", rest, item);
        break;

      case "normal":
        pushShortcut("normalKeyboardShortcuts", rest, item);
        break;

      case "hints":
        pushShortcut("hintsKeyboardShortcuts", rest, item);
        break;

      default:
        options[key] = item;
    }
  }

  return options;
}
