// @flow strict-local

import * as React from "preact";

type Props = {|
  alt?: boolean,
  ctrl?: boolean,
  shift?: boolean,
  press?: string,
  changeCtrlToCmdOnMac?: boolean,
|};

export default function KeyboardShortcut({
  alt = false,
  ctrl = false,
  shift = false,
  press = "",
  changeCtrlToCmdOnMac = true,
}: Props) {
  return (
    <span className="KeyboardShortcut">
      {ctrl && (
        <kbd data-mac={changeCtrlToCmdOnMac ? "Cmd" : undefined}>Ctrl</kbd>
      )}
      {alt && <kbd>Alt</kbd>}
      {shift && <kbd>Shift</kbd>}
      {press !== "" && <kbd>{press}</kbd>}
    </span>
  );
}

export const shortcuts = {
  // Normal.
  EnterHintsMode_Click: <KeyboardShortcut alt press="J" />,
  EnterHintsMode_BackgroundTab: <KeyboardShortcut alt press="K" />,
  EnterHintsMode_ForegroundTab: <KeyboardShortcut alt press="L" />,
  EnterHintsMode_ManyClick: <KeyboardShortcut alt shift press="J" />,
  EnterHintsMode_ManyTab: <KeyboardShortcut alt shift press="K" />,
  EnterHintsMode_Select: <KeyboardShortcut alt shift press="L" />,
  ReverseSelection: (
    <span className="KeyboardShortcut">
      <kbd data-mac="Ctrl">Alt</kbd>
      <kbd>Shift</kbd>
      <kbd>ArrowUp</kbd>
    </span>
  ),
  ClickFocusedElement: (
    <KeyboardShortcut alt ctrl press="Space" changeCtrlToCmdOnMac={false} />
  ),
  Escape: <KeyboardShortcut shift press="Escape" />,

  // Hints.
  ActivateHint: <KeyboardShortcut press="Enter" />,
  ActivateHintAlt: <KeyboardShortcut alt press="Enter" />,
  Backspace: <KeyboardShortcut press="Backspace" />,
  RotateHintsForward: <KeyboardShortcut press="Tab" />,
  RotateHintsBackward: <KeyboardShortcut shift press="Tab" />,
  RefreshHints: <KeyboardShortcut ctrl press="R" />,
  TogglePeek: <KeyboardShortcut ctrl press="P" />,
  ExitHintsMode: <KeyboardShortcut press="Escape" />,
};
