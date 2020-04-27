// @flow strict-local

import * as React from "preact";

type Modifier = boolean | { mac: "alt" | "cmd" | "ctrl" | "shift" };

const MODIFIER_NAMES = {
  alt: "Alt",
  cmd: "Cmd",
  ctrl: "Ctrl",
  shift: "Shift",
};

export default function KeyboardShortcut({
  alt = false,
  ctrl = false,
  shift = false,
  press = "",
}: {
  alt?: Modifier,
  ctrl?: Modifier,
  shift?: Modifier,
  press?: string,
}) {
  const modifiers = [
    [MODIFIER_NAMES.ctrl, ctrl],
    [MODIFIER_NAMES.alt, alt],
    [MODIFIER_NAMES.shift, shift],
  ];
  return (
    <span className="KeyboardShortcut">
      {modifiers.map(([name, modifier]) =>
        modifier ? (
          <kbd
            key={name}
            data-mac={
              typeof modifier === "boolean"
                ? undefined
                : MODIFIER_NAMES[modifier.mac]
            }
          >
            {name}
          </kbd>
        ) : undefined
      )}
      {press !== "" && <kbd>{press}</kbd>}
    </span>
  );
}

function MainShortcut({
  shift = false,
  press,
}: {
  shift?: boolean,
  press: string,
}) {
  return <KeyboardShortcut alt={{ mac: "ctrl" }} shift={shift} press={press} />;
}

export const shortcuts = {
  // Normal.
  EnterHintsMode_Click: <MainShortcut press="J" />,
  EnterHintsMode_BackgroundTab: <MainShortcut press="K" />,
  EnterHintsMode_ForegroundTab: <MainShortcut press="L" />,
  EnterHintsMode_ManyClick: <MainShortcut shift press="J" />,
  EnterHintsMode_ManyTab: <MainShortcut shift press="K" />,
  EnterHintsMode_Select: <MainShortcut shift press="L" />,
  ReverseSelection: (
    <KeyboardShortcut alt={{ mac: "ctrl" }} shift press="ArrowUp" />
  ),
  Escape: <KeyboardShortcut shift press="Escape" />,

  // Hints.
  ActivateHint: <KeyboardShortcut press="Enter" />,
  ActivateHintAlt: <KeyboardShortcut alt={{ mac: "ctrl" }} press="Enter" />,
  Backspace: <KeyboardShortcut press="Backspace" />,
  RotateHintsForward: <KeyboardShortcut press="Tab" />,
  RotateHintsBackward: <KeyboardShortcut shift press="Tab" />,
  RefreshHints: <KeyboardShortcut ctrl={{ mac: "cmd" }} press="R" />,
  TogglePeek: <KeyboardShortcut ctrl={{ mac: "cmd" }} press="P" />,
  ExitHintsMode: <KeyboardShortcut press="Escape" />,

  // Extra.
  Alt: <KeyboardShortcut alt={{ mac: "ctrl" }} />,
};
