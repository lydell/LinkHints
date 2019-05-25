// @flow strict-local

import {
  boolean,
  field,
  map,
  mixedArray,
  mixedDict,
  repr,
  string,
} from "tiny-decoders";

import {
  type KeyPair,
  type KeyTranslations,
  type KeyboardMapping,
  EN_US_QWERTY_TRANSLATIONS,
  decodeKeyPair,
  decodeKeyboardMapping,
  decodeKeyboardMappingWithModifiers,
  deserializeShortcut,
  serializeShortcut,
} from "./keyboard";
import {
  type LogLevel,
  DEFAULT_LOG_LEVEL,
  decodeLogLevel,
  decodeUnsignedInt,
  deepEqual,
} from "./main";

export type OptionsData = {|
  values: Options,
  defaults: Options,
  raw: FlatOptions,
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

export type FlatOptions = { [string]: mixed };

export function makeOptionsDecoder(
  defaults: Options
): mixed => [Options, Array<string>] {
  return map(
    recordWithDefaultsAndErrors(defaults, {
      chars: map(string, validateChars),
      autoActivate: boolean,
      overTypingDuration: decodeUnsignedInt,
      css: string,
      logLevel: map(string, decodeLogLevel),
      useKeyTranslations: boolean,
      keyTranslations: dictWithErrors(decodeKeyPair),
      normalKeyboardShortcuts: arrayWithErrors(
        decodeKeyboardMappingWithModifiers
      ),
      hintsKeyboardShortcuts: arrayWithErrors(decodeKeyboardMapping),
    }),
    ([
      {
        keyTranslations,
        normalKeyboardShortcuts,
        hintsKeyboardShortcuts,
        ...options
      },
      errors,
    ]) => {
      const [keys, keysErrors] = separateKeyTranslationsAndErrors(
        "keyTranslations",
        keyTranslations
      );
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
          keyTranslations: keys,
          normalKeyboardShortcuts: normal,
          hintsKeyboardShortcuts: hints,
        },
        errors.concat(keysErrors, normalErrors, hintsErrors).map(
          ([key, error]) =>
            // Using `JSON.stringify` here instead of `repr` in order not to
            // truncate the option name.
            `Decode error for option ${JSON.stringify(key)}: ${error.message}`
        ),
      ];
    }
  );
}

function separateKeyTranslationsAndErrors(
  name: string,
  keyTranslationsWithErrors: { [string]: KeyPair | TypeError }
): [{ [string]: KeyPair }, Array<[string, Error]>] {
  const keyTranslations: { [string]: KeyPair } = {};
  const errors: Array<[string, Error]> = [];

  for (const key of Object.keys(keyTranslationsWithErrors)) {
    const item = keyTranslationsWithErrors[key];
    if (item instanceof TypeError) {
      errors.push([`${name}[${repr(key)}]`, item]);
    } else {
      keyTranslations[key] = item;
    }
  }

  return [keyTranslations, errors];
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
          shift: false,
        },
        action: "EnterHintsMode_ManyClick",
      },
      {
        shortcut: {
          key: "K",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
        },
        action: "EnterHintsMode_ManyTab",
      },
      {
        shortcut: {
          key: "L",
          alt: true,
          cmd: false,
          ctrl: false,
          shift: false,
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

// This also ignores `null` values.
function arrayWithErrors<T>(
  decoder: mixed => T
): mixed => Array<T | TypeError> {
  return function arrayWithErrorsDecoder(value: mixed): Array<T | TypeError> {
    const arr = mixedArray(value);
    const result = [];
    for (let index = 0; index < arr.length; index++) {
      if (arr[index] !== null) {
        try {
          result.push(field(index, decoder)(arr));
        } catch (error) {
          result.push(error);
        }
      }
    }
    return result;
  };
}

// This also ignores `null` values.
export function dictWithErrors<T>(
  decoder: mixed => T
): mixed => { [string]: T | TypeError } {
  return function dictWithErrorsDecoder(
    value: mixed
  ): { [string]: T | TypeError } {
    const obj = mixedDict(value);
    const keys = Object.keys(obj);
    const result = {};
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (obj[key] !== null) {
        try {
          result[key] = field(key, decoder)(obj);
        } catch (error) {
          result[key] = error;
        }
      }
    }
    return result;
  };
}

export function flattenOptions(options: Options): FlatOptions {
  const {
    keyTranslations,
    normalKeyboardShortcuts,
    hintsKeyboardShortcuts,
    ...rest
  } = options;

  return {
    ...rest,
    ...flattenKeyTranslations(keyTranslations, "keys"),
    ...flattenKeyboardMappings(normalKeyboardShortcuts, "normal"),
    ...flattenKeyboardMappings(hintsKeyboardShortcuts, "hints"),
  };
}

function flattenKeyTranslations(
  keyTranslations: KeyTranslations,
  prefix: string
): FlatOptions {
  return Object.keys(keyTranslations).reduce((result, code) => {
    result[`${prefix}.${code}`] = keyTranslations[code];
    return result;
  }, {});
}

function flattenKeyboardMappings(
  mappings: Array<KeyboardMapping>,
  prefix: string
): FlatOptions {
  return mappings.reduce((result, mapping) => {
    result[`${prefix}.${serializeShortcut(mapping.shortcut)}`] = mapping.action;
    return result;
  }, {});
}

const PREFIX_REGEX = /([^.]+)\.([^]*)/;

// This takes a flat object and turns it into an object that can be fed to
// `makeOptionsDecoder`.
export function unflattenOptions(object: FlatOptions): FlatOptions {
  const options = {};

  function set(parent: string, key: string, value: mixed) {
    if (!(typeof options[parent] === "object" && options[parent] != null)) {
      options[parent] = {};
    }
    options[parent][key] = value;
  }

  function pushShortcut(parent: string, key: string, value: mixed) {
    if (!Array.isArray(options[parent])) {
      options[parent] = [];
    }
    options[parent].push(
      value === null
        ? null
        : {
            shortcut: deserializeShortcut(key),
            action: value,
          }
    );
  }

  for (const key of Object.keys(object)) {
    const item = object[key];
    const [, start, rest] = PREFIX_REGEX.exec(key) || ["", "", ""];

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

export const DEBUG_PREFIX = "debug.";

export function diffOptions(
  defaults: FlatOptions,
  fullOptions: FlatOptions,
  saved: FlatOptions
): {| keysToRemove: Array<string>, optionsToSet: FlatOptions |} {
  const keysToRemove = [];
  const optionsToSet = {};

  // `defaults` and `fullOptions` have some keys in common. `fullOptions` might
  // have removed some keys present in `defaults`, and added some new ones. If
  // added ones are later removed, those are only present in `saved`.
  const allKeys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(fullOptions),
    ...Object.keys(saved),
  ]);

  for (const key of allKeys) {
    if (key.startsWith(DEBUG_PREFIX)) {
      continue;
    } else if (
      {}.hasOwnProperty.call(defaults, key) &&
      !{}.hasOwnProperty.call(fullOptions, key)
    ) {
      // Default deleted; only set if needed.
      if (saved[key] !== null) {
        // Mark as deleted.
        optionsToSet[key] = null;
      }
    } else if (
      !{}.hasOwnProperty.call(defaults, key) &&
      {}.hasOwnProperty.call(fullOptions, key)
    ) {
      // Added new; only set if needed.
      if (!deepEqual(fullOptions[key], saved[key])) {
        optionsToSet[key] = fullOptions[key];
      }
    } else if (deepEqual(fullOptions[key], defaults[key])) {
      // Option is the same as default; remove if needed.
      if ({}.hasOwnProperty.call(saved, key)) {
        keysToRemove.push(key);
      }
    } else if (
      {}.hasOwnProperty.call(saved, key) &&
      !{}.hasOwnProperty.call(fullOptions, key)
    ) {
      // Extra deleted; remove.
      keysToRemove.push(key);
    } else if (!deepEqual(fullOptions[key], saved[key])) {
      // Set user option, if needed.
      optionsToSet[key] = fullOptions[key];
    }
  }

  return {
    keysToRemove,
    optionsToSet,
  };
}

export function importOptions(
  flatOptions: FlatOptions,
  options: Options,
  defaults: Options
): {|
  options: ?Options,
  successCount: number,
  errors: Array<string>,
|} {
  try {
    const keyErrors = Object.keys(unflattenOptions(flatOptions))
      .map(key =>
        ({}.hasOwnProperty.call(defaults, key)
          ? undefined
          : `Unknown key: ${repr(key)}`)
      )
      .filter(Boolean);
    const updatedOptionsFlat = {
      ...flattenOptions(options),
      ...flatOptions,
    };
    const unflattened = unflattenOptions(updatedOptionsFlat);
    const decoder = makeOptionsDecoder(defaults);
    const [newOptions, decodeErrors] = decoder(unflattened);
    const errors = keyErrors.concat(decodeErrors);
    return {
      options: newOptions,
      successCount: Object.keys(flatOptions).length - errors.length,
      errors,
    };
  } catch (error) {
    return {
      options: undefined,
      successCount: 0,
      errors: [`The file is invalid: ${error.message}`],
    };
  }
}
