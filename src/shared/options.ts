import {
  array,
  boolean,
  chain,
  Decoder,
  DecoderError,
  fields,
  record,
  repr,
  string,
} from "tiny-decoders";

import {
  deserializeShortcut,
  EN_US_QWERTY_TRANSLATIONS,
  KeyboardMapping,
  KeyboardMappingWithModifiers,
  KeyPair,
  KeyTranslations,
  serializeShortcut,
  Shortcut,
} from "./keyboard";
import {
  decode,
  deepEqual,
  DEFAULT_LOG_LEVEL,
  LogLevel,
  UnsignedInt,
} from "./main";

export type OptionsData = {
  values: Options;
  defaults: Options;
  raw: FlatOptions;
  errors: Array<string>;
  mac: boolean;
};

export type Options = {
  chars: string;
  autoActivate: boolean;
  overTypingDuration: number;
  css: string;
  logLevel: LogLevel;
  useKeyTranslations: boolean;
  keyTranslations: KeyTranslations;
  normalKeyboardShortcuts: Array<KeyboardMapping>;
  hintsKeyboardShortcuts: Array<KeyboardMapping>;
};

export type PartialOptions = Partial<Options>;

export type FlatOptions = Record<string, unknown>;

export function makeOptionsDecoder(defaults: Options): Decoder<Options> {
  return fields(
    (field) => ({
      chars: field("chars", chain(string, validateChars), {
        mode: { default: defaults.chars },
      }),
      autoActivate: field("autoActivate", boolean, {
        mode: { default: defaults.autoActivate },
      }),
      overTypingDuration: field("overTypingDuration", UnsignedInt, {
        mode: { default: defaults.overTypingDuration },
      }),
      css: field("css", string, {
        mode: { default: defaults.css },
      }),
      logLevel: field("logLevel", LogLevel, {
        mode: { default: defaults.logLevel },
      }),
      useKeyTranslations: field("useKeyTranslations", boolean, {
        mode: { default: defaults.useKeyTranslations },
      }),
      keyTranslations: field(
        "keyTranslations",
        record(KeyPair, { mode: "skip" }),
        { mode: { default: defaults.keyTranslations } }
      ),
      normalKeyboardShortcuts: field(
        "normalKeyboardShortcuts",
        array(KeyboardMappingWithModifiers, { mode: "skip" }),
        { mode: { default: defaults.normalKeyboardShortcuts } }
      ),
      hintsKeyboardShortcuts: field(
        "hintsKeyboardShortcuts",
        array(KeyboardMapping, { mode: "skip" }),
        { mode: { default: defaults.hintsKeyboardShortcuts } }
      ),
    }),
    {
      exact: "push",
    }
  );
}

const MIN_CHARS = 2;

function validateChars(chars: string): string {
  if (/\s/.test(chars)) {
    throw new DecoderError({
      message: "Expected chars not to contain whitespace",
      value: chars,
    });
  }

  const match = /(.)(?=.*\1)/.exec(chars);
  if (match !== null) {
    throw new DecoderError({
      message: `Expected chars not to contain duplicate characters, but got ${repr(
        match[1]
      )} more than once.`,
      value: DecoderError.MISSING_VALUE,
    });
  }

  if (chars.length < MIN_CHARS) {
    throw new DecoderError({
      message: `Expected at least ${repr(MIN_CHARS)} chars`,
      value: chars.length,
    });
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

export function getDefaults({ mac }: { mac: boolean }): Options {
  function shortcut({
    key,
    alt = false,
    cmd = false,
    ctrl = false,
    shift = false,
  }: Partial<Shortcut> & Pick<Shortcut, "key">): Shortcut {
    return { key, alt, cmd, ctrl, shift };
  }

  function mainShortcut(key: string): Shortcut {
    return {
      key,
      alt: !mac,
      cmd: false,
      ctrl: mac,
      shift: false,
    };
  }

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
        shortcut: mainShortcut("j"),
        action: "EnterHintsMode_Click",
      },
      {
        shortcut: mainShortcut("k"),
        action: "EnterHintsMode_BackgroundTab",
      },
      {
        shortcut: mainShortcut("l"),
        action: "EnterHintsMode_ForegroundTab",
      },
      {
        shortcut: mainShortcut("J"),
        action: "EnterHintsMode_ManyClick",
      },
      {
        shortcut: mainShortcut("K"),
        action: "EnterHintsMode_ManyTab",
      },
      {
        shortcut: mainShortcut("L"),
        action: "EnterHintsMode_Select",
      },
      {
        shortcut: shortcut({
          key: "ArrowUp",
          alt: !mac,
          ctrl: mac,
          shift: true,
        }),
        action: "ReverseSelection",
      },
      {
        shortcut: shortcut({
          key: "Escape",
          shift: true,
        }),
        action: "Escape",
      },
    ],
    hintsKeyboardShortcuts: [
      {
        shortcut: shortcut({
          key: "Enter",
        }),
        action: "ActivateHint",
      },
      {
        shortcut: shortcut({
          key: "Enter",
          alt: !mac,
          ctrl: mac,
        }),
        action: "ActivateHintAlt",
      },
      {
        shortcut: shortcut({
          key: "Backspace",
        }),
        action: "Backspace",
      },
      {
        shortcut: shortcut({
          key: "Tab",
        }),
        action: "RotateHintsForward",
      },
      {
        shortcut: shortcut({
          key: "Tab",
          shift: true,
        }),
        action: "RotateHintsBackward",
      },
      {
        shortcut: shortcut({
          key: "r",
          cmd: mac,
          ctrl: !mac,
        }),
        action: "RefreshHints",
      },
      {
        shortcut: shortcut({
          key: "p",
          cmd: mac,
          ctrl: !mac,
        }),
        action: "TogglePeek",
      },
      {
        shortcut: shortcut({
          key: "Escape",
        }),
        action: "ExitHintsMode",
      },
      {
        shortcut: shortcut({
          key: "Escape",
          shift: true,
        }),
        action: "Escape",
      },
    ],
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
  return Object.fromEntries(
    Object.keys(keyTranslations).map((code) => [
      `${prefix}.${code}`,
      keyTranslations[code],
    ])
  );
}

function flattenKeyboardMappings(
  mappings: Array<KeyboardMapping>,
  prefix: string
): FlatOptions {
  return Object.fromEntries(
    mappings.map((mapping) => [
      `${prefix}.${serializeShortcut(mapping.shortcut)}`,
      mapping.action,
    ])
  );
}

const PREFIX_REGEX = /([^.]+)\.([^]*)/;

// This takes a flat object and turns it into an object that can be fed to
// `makeOptionsDecoder`. It also returns a map where you can lookup the `.path`
// of a `DecoderError` to get the original key in the flat object.
export function unflattenOptions(
  object: FlatOptions
): [FlatOptions, Map<string, Array<number | string>>] {
  const options: FlatOptions = {};
  const map = new Map<string, Array<number | string>>();

  function set(
    parent: string,
    fullKey: string,
    key: string,
    value: unknown
  ): void {
    if (!(typeof options[parent] === "object" && options[parent] !== null)) {
      options[parent] = {};
    }
    if (value !== null) {
      (options[parent] as FlatOptions)[key] = value;
      map.set(JSON.stringify([parent, key]), [fullKey]);
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index++) {
          map.set(JSON.stringify([parent, key, index]), [fullKey, index]);
        }
      } else if (typeof value === "object" && value !== null) {
        for (const subKey of Object.keys(value)) {
          map.set(JSON.stringify([parent, key, subKey]), [fullKey, subKey]);
        }
      }
    }
  }

  function pushShortcut(
    parent: string,
    fullKey: string,
    key: string,
    value: unknown
  ): void {
    if (!Array.isArray(options[parent])) {
      options[parent] = [];
    }
    if (value !== null) {
      const length = (options[parent] as Array<unknown>).push({
        shortcut: deserializeShortcut(key),
        action: value,
      });
      map.set(JSON.stringify([parent, length - 1, "shortcut"]), [fullKey]);
      map.set(JSON.stringify([parent, length - 1, "action"]), [fullKey]);
    }
  }

  for (const key of Object.keys(object)) {
    const item = object[key];
    const [, start, rest] = PREFIX_REGEX.exec(key) ?? ["", "", ""];

    switch (start) {
      case "keys":
        set("keyTranslations", key, rest, item);
        break;

      case "normal":
        pushShortcut("normalKeyboardShortcuts", key, rest, item);
        break;

      case "hints":
        pushShortcut("hintsKeyboardShortcuts", key, rest, item);
        break;

      default:
        options[key] = item;
    }
  }

  return [options, map];
}

export const DEBUG_PREFIX = "debug.";

export async function getRawOptions(): Promise<FlatOptions> {
  const raw = await browser.storage.sync.get();
  // Exclude all tweakables since they are handled completely differently.
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => !key.startsWith(DEBUG_PREFIX))
  );
}

export function diffOptions(
  defaults: FlatOptions,
  fullOptions: FlatOptions,
  saved: FlatOptions
): { keysToRemove: Array<string>; optionsToSet: FlatOptions } {
  const keysToRemove: Array<string> = [];
  const optionsToSet: FlatOptions = {};

  // `defaults` and `fullOptions` have some keys in common. `fullOptions` might
  // have removed some keys present in `defaults`, and added some new ones. If
  // added ones are later removed, those are only present in `saved`.
  const allKeys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(fullOptions),
    ...Object.keys(saved),
  ]);

  for (const key of allKeys) {
    if (
      Object.prototype.hasOwnProperty.call(defaults, key) &&
      !Object.prototype.hasOwnProperty.call(fullOptions, key)
    ) {
      // Default deleted; only set if needed.
      if (saved[key] !== null) {
        // Mark as deleted.
        optionsToSet[key] = null;
      }
    } else if (
      !Object.prototype.hasOwnProperty.call(defaults, key) &&
      Object.prototype.hasOwnProperty.call(fullOptions, key)
    ) {
      // Added new; only set if needed.
      if (!deepEqual(fullOptions[key], saved[key])) {
        optionsToSet[key] = fullOptions[key];
      }
    } else if (deepEqual(fullOptions[key], defaults[key])) {
      // Option is the same as default; remove if needed.
      if (Object.prototype.hasOwnProperty.call(saved, key)) {
        keysToRemove.push(key);
      }
    } else if (
      Object.prototype.hasOwnProperty.call(saved, key) &&
      !Object.prototype.hasOwnProperty.call(fullOptions, key)
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
): {
  options: Options | undefined;
  successCount: number;
  errors: Array<string>;
} {
  try {
    const updatedOptionsFlat = {
      ...flattenOptions(options),
      ...flatOptions,
    };
    const [unflattened, map] = unflattenOptions(updatedOptionsFlat);
    const errors: Array<string> = [];
    const newOptions = decode(
      makeOptionsDecoder(defaults),
      unflattened,
      errors,
      map
    );
    return {
      options: newOptions,
      successCount: Object.keys(flatOptions).length - errors.length,
      errors,
    };
  } catch (errorAny) {
    const error = errorAny as Error;
    return {
      options: undefined,
      successCount: 0,
      errors: [`The file is invalid: ${error.message}`],
    };
  }
}
