// @flow strict-local

import {
  boolean,
  constant,
  field,
  fieldAndThen,
  group,
  map,
  record,
  repr,
  string,
} from "tiny-decoders";

export type KeyboardAction =
  | {|
      type: "EnterHintsMode",
      mode: HintsMode,
    |}
  | {|
      type: "ExitHintsMode",
    |}
  | {|
      type: "RotateHints",
      forward: boolean,
    |}
  | {|
      type: "RefreshHints",
    |}
  | {|
      type: "TogglePeek",
    |}
  | {|
      type: "Escape",
    |}
  | {|
      type: "ActivateHint",
      alt: boolean,
    |}
  | {|
      type: "Backspace",
    |}
  | {|
      type: "ReverseSelection",
    |}
  | {|
      type: "ClickFocusedElement",
    |};

const decodeKeyboardAction: mixed => KeyboardAction = fieldAndThen(
  "type",
  string,
  getKeyboardActionDecoder
);

function getKeyboardActionDecoder(type: string): mixed => KeyboardAction {
  switch (type) {
    case "EnterHintsMode":
      return record({
        type: constant(type),
        mode: map(string, decodeHintsMode),
      });

    case "ExitHintsMode":
      return () => ({ type: "ExitHintsMode" });

    case "RotateHints":
      return record({
        type: constant(type),
        forward: boolean,
      });

    case "RefreshHints":
      return () => ({ type: "RefreshHints" });

    case "TogglePeek":
      return () => ({ type: "TogglePeek" });

    case "Escape":
      return () => ({ type: "Escape" });

    case "ActivateHint":
      return record({
        type: constant(type),
        alt: boolean,
      });

    case "Backspace":
      return () => ({ type: "Backspace" });

    case "ReverseSelection":
      return () => ({ type: "ReverseSelection" });

    case "ClickFocusedElement":
      return () => ({ type: "ClickFocusedElement" });

    default:
      throw new TypeError(`Invalid KeyboardAction type: ${repr(type)}`);
  }
}

// Raw values from a `KeyboardEvent` that we care about.
export type Keypress = {|
  key: string,
  code: string,
  alt: boolean,
  cmd: boolean,
  ctrl: boolean,
  shift: boolean,
|};

const decodeKeypress: mixed => Keypress = record({
  key: string,
  code: string,
  alt: boolean,
  cmd: boolean,
  ctrl: boolean,
  shift: boolean,
});

// A `Keypress` after taking `KeyTranslations` into account.
export type NormalizedKeypress = {|
  key: string,
  printableKey: ?string,
  alt: boolean,
  cmd: boolean,
  ctrl: boolean,
  // If missing it means that the shift key doesn’t matter. For example, it
  // doesn’t matter if you need to press shift to type a `/` or not (which
  // differs between keyboard layouts).
  shift: ?boolean,
|};

export type KeyboardMapping = {|
  keypress: Keypress,
  action: KeyboardAction,
|};

export const decodeKeyboardMapping: mixed => KeyboardMapping = record({
  keypress: decodeKeypress,
  action: decodeKeyboardAction,
});

export type KeyboardMode = "Normal" | "Hints" | "PreventOverTyping";

export type HintsMode =
  | "Click"
  | "ManyClick"
  | "ManyTab"
  | "BackgroundTab"
  | "ForegroundTab"
  | "Select";

export function decodeHintsMode(type: string): HintsMode {
  switch (type) {
    case "Click":
    case "ManyClick":
    case "ManyTab":
    case "BackgroundTab":
    case "ForegroundTab":
    case "Select":
      return type;
    default:
      throw new TypeError(`Invalid HintsMode: ${repr(type)}`);
  }
}

export type KeyPair = [string, string];

export const decodeKeyPair: mixed => KeyPair = map(
  group({
    unshifted: field(0, string),
    shifted: field(1, string),
  }),
  ({ unshifted, shifted }) => [unshifted, shifted]
);

export type KeyTranslations = { [code: string]: KeyPair };

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
  };
}

export function normalizeKeypress({
  keypress,
  keyTranslations,
}: {|
  keypress: Keypress,
  keyTranslations: KeyTranslations,
|}): NormalizedKeypress {
  // If ignoring the keyboard layout, try to translate `.code` to a `.key`
  // value. Use `.key` otherwise.
  const translated = translateCode({
    code: keypress.code,
    shift: keypress.shift,
    keyTranslations,
  });
  const key = translated != null ? translated : keypress.key;

  // Space is both printable and non-printable, and allows shift.
  return {
    key: key === " " ? "Space" : key,
    printableKey: key.length === 1 ? key : undefined,
    alt: keypress.alt,
    cmd: keypress.cmd,
    ctrl: keypress.ctrl,
    shift: key.length > 1 || key === " " ? keypress.shift : undefined,
  };
}

function translateCode({
  code,
  shift,
  keyTranslations,
}: {|
  code: string,
  shift: boolean,
  keyTranslations: KeyTranslations,
|}): ?string {
  if ({}.hasOwnProperty.call(keyTranslations, code)) {
    const [unshifted, shifted] = keyTranslations[code];
    return shift ? shifted : unshifted;
  }

  return undefined;
}

const MODIFIER_KEYS: Set<string> = new Set([
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
