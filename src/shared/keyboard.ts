import {
  boolean,
  DecoderResult,
  fields,
  flatMap,
  Infer,
  string,
  stringUnion,
  tuple,
} from "./codec";

export type KeyboardAction = Infer<typeof KeyboardAction>;
export const KeyboardAction = stringUnion([
  "ActivateHint",
  "ActivateHintAlt",
  "Backspace",
  "EnterHintsMode_BackgroundTab",
  "EnterHintsMode_Click",
  "EnterHintsMode_ForegroundTab",
  "EnterHintsMode_ManyClick",
  "EnterHintsMode_ManyTab",
  "EnterHintsMode_Select",
  "Escape",
  "ExitHintsMode",
  "RefreshHints",
  "ReverseSelection",
  "RotateHintsBackward",
  "RotateHintsForward",
  "TogglePeek",
]);

// Allow exiting hints mode if we ever get stuck in Prevent overtyping mode.
export const PREVENT_OVERTYPING_ALLOWED_KEYBOARD_ACTIONS =
  new Set<KeyboardAction>(["Escape", "ExitHintsMode"]);

// Raw values from a `KeyboardEvent` that we care about.
export type Keypress = {
  key: string;
  code: string;
  alt: boolean;
  cmd: boolean;
  ctrl: boolean;
  shift: boolean;
  capslock: boolean;
};

// A `Keypress` after taking `KeyTranslations` into account.
export type NormalizedKeypress = {
  key: string;
  printableKey: string | undefined;
  alt: boolean;
  cmd: boolean;
  ctrl: boolean;
  // If missing it means that the shift key doesn’t matter. For example, it
  // doesn’t matter if you need to press shift to type a `/` or not (which
  // differs between keyboard layouts).
  shift: boolean | undefined;
};

export type Shortcut = Infer<typeof Shortcut>;
const Shortcut = fields({
  key: string,
  alt: boolean,
  cmd: boolean,
  ctrl: boolean,
  shift: boolean,
});

const EMPTY_SHORTCUT: Shortcut = {
  key: "",
  alt: false,
  cmd: false,
  ctrl: false,
  shift: false,
};

function requireModifier(shortcut: Shortcut): DecoderResult<Shortcut> {
  const { key, alt, cmd, ctrl, shift } = shortcut;
  return alt || cmd || ctrl || (shift && key.length > 1)
    ? { tag: "Valid", value: shortcut }
    : {
        tag: "DecoderError",
        errors: [
          {
            tag: "custom",
            message: "Expected Shortcut to use a least one modifier",
            got: shortcut,
            path: [],
          },
        ],
      };
}

const SHORTCUT_SEPARATOR = "-";

export function serializeShortcut(shortcut: Shortcut): string {
  return [
    shortcut.alt ? "alt" : undefined,
    shortcut.cmd ? "cmd" : undefined,
    shortcut.ctrl ? "ctrl" : undefined,
    shortcut.shift ? "shift" : undefined,
    shortcut.key,
  ]
    .filter((name) => name !== undefined)
    .join(SHORTCUT_SEPARATOR);
}

// This turns a shortcut string into an object that can be fed to `Shortcut`.
export function deserializeShortcut(
  shortcutString: string
): Record<string, unknown> {
  const parts = shortcutString.split(SHORTCUT_SEPARATOR);
  const lastIndex = parts.length - 1;
  return parts.reduce(
    (shortcut, part, index) =>
      index === lastIndex
        ? // If the last part is empty, we’re deserializing a shortcut like `alt--`.
          { ...shortcut, key: part === "" ? SHORTCUT_SEPARATOR : part }
        : // Ignore empty parts, such as in `alt--x`.
        part !== ""
        ? // Modifiers.
          { ...shortcut, [part]: true }
        : shortcut,
    { ...EMPTY_SHORTCUT }
  );
}

export type KeyboardMapping = Infer<typeof KeyboardMapping>;
export const KeyboardMapping = fields({
  shortcut: Shortcut,
  action: KeyboardAction,
});

export const KeyboardMappingWithModifiers = fields({
  shortcut: flatMap(Shortcut, {
    decoder: requireModifier,
    encoder: (shortcut) => shortcut,
  }),
  action: KeyboardAction,
});

export type KeyboardModeBackground =
  | { type: "Capture" }
  | { type: "FromHintsState" }
  | { type: "PreventOverTyping"; sinceTimestamp: number };

export type KeyboardModeWorker =
  | "Capture"
  | "Hints"
  | "Normal"
  | "PreventOverTyping";

export type HintsMode = Infer<typeof HintsMode>;
export const HintsMode = stringUnion([
  "BackgroundTab",
  "Click",
  "ForegroundTab",
  "ManyClick",
  "ManyTab",
  "Select",
]);

export type KeyPair = Infer<typeof KeyPair>;
export const KeyPair = tuple([string, string]);

export type KeyTranslations = Record<string, KeyPair>;

export const EN_US_QWERTY_TRANSLATIONS: KeyTranslations = {
  Backquote: ["`", "~"],
  Backslash: ["\\", "|"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Comma: [",", "<"],
  Digit0: ["0", ")"],
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Equal: ["=", "+"],
  KeyA: ["a", "A"],
  KeyB: ["b", "B"],
  KeyC: ["c", "C"],
  KeyD: ["d", "D"],
  KeyE: ["e", "E"],
  KeyF: ["f", "F"],
  KeyG: ["g", "G"],
  KeyH: ["h", "H"],
  KeyI: ["i", "I"],
  KeyJ: ["j", "J"],
  KeyK: ["k", "K"],
  KeyL: ["l", "L"],
  KeyM: ["m", "M"],
  KeyN: ["n", "N"],
  KeyO: ["o", "O"],
  KeyP: ["p", "P"],
  KeyQ: ["q", "Q"],
  KeyR: ["r", "R"],
  KeyS: ["s", "S"],
  KeyT: ["t", "T"],
  KeyU: ["u", "U"],
  KeyV: ["v", "V"],
  KeyW: ["w", "W"],
  KeyX: ["x", "X"],
  KeyY: ["y", "Y"],
  KeyZ: ["z", "Z"],
  Minus: ["-", "_"],
  Period: [".", ">"],
  Quote: ["'", '"'],
  Semicolon: [";", ":"],
  Slash: ["/", "?"],
};

export function keyboardEventToKeypress(event: KeyboardEvent): Keypress {
  return {
    key: event.key,
    code: event.code,
    alt: event.altKey,
    cmd: event.metaKey,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    capslock: event.getModifierState("CapsLock"),
  };
}

export function normalizeKeypress({
  keypress,
  keyTranslations,
}: {
  keypress: Keypress;
  keyTranslations: KeyTranslations;
}): NormalizedKeypress {
  // If ignoring the keyboard layout, try to translate `.code` to a `.key`
  // value. Use `.key` otherwise.
  const translated = translateCode({
    code: keypress.code,
    shift: keypress.shift,
    keyTranslations,
  });
  const key = translated !== undefined ? translated : keypress.key;

  // Printable and non-printable are handled slightly differently.
  const isChar = key.length === 1;

  // Space is both printable (" ") and non-printable ("Space"), and allows shift
  // (unlike other printable keys).
  const isSpace = key === " ";

  // Capslock is handled differently based on whether the key comes from
  // `keyTranslations`.
  const wasTranslated = translated !== undefined;

  return {
    key: isSpace
      ? "Space"
      : // For keyboard shortcuts, capslock should not make a difference. When
      // `key` comes from `keyTranslations`, capslock is ignored by definition.
      // When using `event.key`, try to undo the effects of capslock, by
      // changing case.
      isChar && !wasTranslated && keypress.capslock
      ? keypress.shift
        ? key.toUpperCase() // Capslock made it lowercase; change it back.
        : key.toLowerCase() // Capslock made it uppercase; change it back.
      : key,
    printableKey:
      // When typing hints chars or filtering by text, capslock _should_ make a
      // difference. For example, one might use capslock instead of holding
      // shift when filtering by text. Since capslock is ignored when `key`
      // comes from `keyTranslations`, try to simulate capslock. When using
      // `event.key` there’s nothing to do – capslock has already been applied
      // for us.
      isChar
        ? wasTranslated && keypress.capslock
          ? // Remember that shift works the other way around in capslock mode.
            keypress.shift
            ? key.toLowerCase()
            : key.toUpperCase()
          : key
        : undefined,
    alt: keypress.alt,
    cmd: keypress.cmd,
    ctrl: keypress.ctrl,
    // Shift is ignored for printable keys: Shift changes the value of `key`
    // ("a" vs "A", "/" vs "?") and is as such not needed to check when matching
    // keyboard shortcuts. _Not_ checking it means that keyboard shortcuts have
    // a higher chance of working with several keyboard layouts. For example, in
    // the Swedish keyboard layout shift is required to type "/", while in the
    // American layout shift is not pressed when typing "/".
    shift: !isChar || isSpace ? keypress.shift : undefined,
  };
}

function translateCode({
  code,
  shift,
  keyTranslations,
}: {
  code: string;
  shift: boolean;
  keyTranslations: KeyTranslations;
}): string | undefined {
  if (Object.prototype.hasOwnProperty.call(keyTranslations, code)) {
    const [unshifted, shifted] = keyTranslations[code];
    return shift ? shifted : unshifted;
  }

  return undefined;
}

const MODIFIER_KEYS = new Set<string>([
  "Alt",
  "AltGraph",
  "Control",
  "Hyper",
  "Meta",
  "Shift",
  "Super",
  "OS",
]);

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}
