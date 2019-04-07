// @flow strict-local

import * as React from "preact";

import {
  type KeyboardAction,
  type KeyboardMapping,
  type NormalizedKeypress,
  type Shortcut,
  serializeShortcut,
} from "../shared/keyboard";
import { classlist, deepEqual, unreachable } from "../shared/main";
import ButtonWithPopup from "./ButtonWithPopup";
import Field from "./Field";
import KeyboardShortcut, { hasShift } from "./KeyboardShortcut";

type ShortcutError =
  | { type: "UnrecognizedKey" }
  | { type: "MissingModifier", shift: boolean }
  | { type: "OtherShortcutConflict", otherMapping: KeyboardMapping };

type Props = {|
  id: string,
  name: string,
  description?: React.Node,
  mac: boolean,
  requireModifiers: boolean,
  chars: string,
  mappings: Array<KeyboardMapping>,
  defaultMappings: Array<KeyboardMapping>,
  capturedKeypressWithTimestamp: ?{|
    timestamp: number,
    keypress: NormalizedKeypress,
  |},
  onChange: (Array<KeyboardMapping>) => void,
  onAddChange: boolean => void,
|};

type State = {|
  addingAction: ?KeyboardAction,
  shortcutError: ?{|
    shortcut: Shortcut,
    error: ShortcutError,
  |},
|};

export default class KeyboardShortcuts extends React.Component<Props, State> {
  static defaultProps = {
    requireModifiers: false,
  };

  state = {
    addingAction: undefined,
    shortcutError: undefined,
  };

  componentDidUpdate(prevProps: Props) {
    const {
      capturedKeypressWithTimestamp,
      requireModifiers,
      mappings,
      onAddChange,
    } = this.props;
    const { addingAction } = this.state;

    if (
      !deepEqual(
        capturedKeypressWithTimestamp,
        prevProps.capturedKeypressWithTimestamp
      )
    ) {
      if (capturedKeypressWithTimestamp == null || addingAction == null) {
        this.setState({ shortcutError: undefined });
        return;
      }

      const capturedKeypress = capturedKeypressWithTimestamp.keypress;
      const { shortcutError } = this.state;

      const shortcut: Shortcut = {
        key: capturedKeypress.key,
        alt: capturedKeypress.alt,
        cmd: capturedKeypress.cmd,
        ctrl: capturedKeypress.ctrl,
        shift: capturedKeypress.shift == null ? false : capturedKeypress.shift,
      };

      // The Space key is a good choice for cancelling since it cannot be used
      // in Hints mode (it breaks filter by text). (In Normal mode, shortcuts
      // without modifiers cannot be used anyway.)
      if (shortcut.key === "Space" && !hasModifier(shortcut)) {
        this.setState({
          addingAction: undefined,
          shortcutError: undefined,
        });
        onAddChange(false);
        return;
      }

      if (!isRecognized(shortcut.key)) {
        this.setState({
          shortcutError: {
            shortcut,
            error: { type: "UnrecognizedKey" },
          },
        });
        return;
      }

      if (
        requireModifiers &&
        !(hasModifier(shortcut) || isAllowedWithShiftOnly(shortcut))
      ) {
        this.setState({
          shortcutError: {
            shortcut,
            error: { type: "MissingModifier", shift: hasShift(shortcut) },
          },
        });
        return;
      }

      const conflictingMapping = mappings.find(mapping =>
        deepEqual(mapping.shortcut, shortcut)
      );
      if (conflictingMapping != null) {
        if (conflictingMapping.action === addingAction) {
          this.setState({
            addingAction: undefined,
            shortcutError: undefined,
          });
          onAddChange(false);
        } else {
          const newShortcutError = {
            shortcut,
            error: {
              type: "OtherShortcutConflict",
              otherMapping: conflictingMapping,
            },
          };
          if (deepEqual(shortcutError, newShortcutError)) {
            this.saveMapping({
              shortcut,
              action: addingAction,
            });
          } else {
            this.setState({
              shortcutError: newShortcutError,
            });
          }
        }

        return;
      }

      this.saveMapping({
        shortcut,
        action: addingAction,
      });
    }
  }

  saveMapping(newMapping: KeyboardMapping) {
    const { mappings, onChange, onAddChange } = this.props;
    const newMappings = mappings
      .filter(mapping => !deepEqual(mapping.shortcut, newMapping.shortcut))
      .concat(newMapping);

    this.setState({
      addingAction: undefined,
      shortcutError: undefined,
    });

    onChange(newMappings);
    onAddChange(false);
  }

  render() {
    const {
      id,
      name,
      description,
      mac,
      mappings,
      defaultMappings,
      chars,
      onChange,
      onAddChange,
    } = this.props;
    const { addingAction, shortcutError } = this.state;

    return (
      <Field
        id={id}
        fullWidth
        label={name}
        span
        description={description}
        changed={false}
        render={() => (
          <div>
            <table className="ShortcutsTable">
              <tbody>
                {defaultMappings.map((defaultMapping, index) => {
                  const shortcuts = mappings
                    .filter(mapping => mapping.action === defaultMapping.action)
                    .map(mapping => ({
                      key: serializeShortcut(mapping.shortcut),
                      shortcut: mapping.shortcut,
                    }))
                    .sort((a, b) => compare(a.key, b.key));

                  const changed = !(
                    shortcuts.length === 1 &&
                    shortcuts.every(({ shortcut }) =>
                      deepEqual(shortcut, defaultMapping.shortcut)
                    )
                  );

                  const isAdding = addingAction === defaultMapping.action;

                  const conflictingChars = getConflictingChars(
                    shortcuts.map(({ shortcut }) => shortcut),
                    chars
                  );

                  return (
                    <tr
                      key={index}
                      id={getKeyboardActionId(defaultMapping.action)}
                    >
                      <th className={classlist({ "is-changed": changed })}>
                        <p>
                          {describeKeyboardAction(defaultMapping.action).name}
                        </p>
                        {conflictingChars.length > 0 && (
                          <p className="TextSmall Error">
                            Overridden hint characters:{" "}
                            {conflictingChars.join(", ")}
                          </p>
                        )}
                      </th>
                      <td>
                        <div className="Spaced Spaced--center">
                          <div className="ShortcutsGrid">
                            {shortcuts.map(({ key, shortcut }) => (
                              <div key={key}>
                                <KeyboardShortcut
                                  mac={mac}
                                  shortcut={shortcut}
                                />
                                <button
                                  type="button"
                                  title="Remove this shortcut"
                                  className="RemoveButton"
                                  onClick={() => {
                                    onChange(
                                      mappings.filter(
                                        mapping =>
                                          !deepEqual(shortcut, mapping.shortcut)
                                      )
                                    );
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="AddShortcutButton">
                            <ButtonWithPopup
                              title="Add shortcut"
                              className="AddShortcutButton-button"
                              open={isAdding}
                              buttonContent={<strong>+</strong>}
                              onChange={open => {
                                this.setState({
                                  addingAction: open
                                    ? defaultMapping.action
                                    : undefined,
                                });
                                onAddChange(open);
                              }}
                            >
                              {isAdding && (
                                <div
                                  className="SpacedVertical"
                                  style={{ width: 450 }}
                                >
                                  {shortcutError == null ? (
                                    <ShortcutAddDisplay
                                      mac={mac}
                                      defaultMapping={defaultMapping}
                                    />
                                  ) : (
                                    <div className="SpacedVertical">
                                      <KeyboardShortcut
                                        mac={mac}
                                        shortcut={shortcutError.shortcut}
                                      />
                                      <ShortcutErrorDisplay
                                        mac={mac}
                                        error={shortcutError.error}
                                      />
                                    </div>
                                  )}
                                  <p className="TextSmall">
                                    <em>
                                      Press{" "}
                                      <KeyboardShortcut
                                        mac={mac}
                                        shortcut={{ key: "Space" }}
                                      />{" "}
                                      to cancel.
                                    </em>
                                  </p>
                                </div>
                              )}
                            </ButtonWithPopup>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      />
    );
  }
}

function ShortcutAddDisplay({
  mac,
  defaultMapping,
}: {|
  mac: boolean,
  defaultMapping: KeyboardMapping,
|}) {
  return (
    <div>
      <p>
        <strong>Press the keyboard shortcut you’d like to use!</strong>
      </p>

      <div className="TextSmall SpacedVertical" style={{ marginTop: 15 }}>
        <p>
          Default:{" "}
          <KeyboardShortcut mac={mac} shortcut={defaultMapping.shortcut} />
        </p>
        <p>
          Note: Some browser/OS shortcuts cannot be overridden. For example,{" "}
          <KeyboardShortcut
            mac={mac}
            shortcut={{
              key: "w",
              cmd: mac,
              ctrl: !mac,
            }}
          />{" "}
          cannot be detected and always closes the current tab.
        </p>
      </div>
    </div>
  );
}

function ShortcutErrorDisplay({
  error,
  mac,
}: {|
  error: ShortcutError,
  mac: boolean,
|}) {
  switch (error.type) {
    case "UnrecognizedKey":
      return (
        <div>
          <p>
            <strong>This key was not recognized.</strong>
          </p>
          <p>Please choose another one!</p>
        </div>
      );

    case "MissingModifier":
      if (error.shift) {
        return (
          <p>
            <strong>
              Only <KeyboardShortcut mac={mac} shortcut={{ key: "Escape" }} />{" "}
              and <KeyboardShortcut mac={mac} shortcut={{ key: "F1" }} />
              –
              <KeyboardShortcut mac={mac} shortcut={{ key: "F12" }} /> can be
              used with only{" "}
              <KeyboardShortcut mac={mac} shortcut={{ key: "", shift: true }} />{" "}
              for main keyboard shortcuts.
            </strong>
          </p>
        );
      }
      return (
        <p>
          <strong>Main keyboard shortcuts must use a modifier.</strong>
        </p>
      );

    case "OtherShortcutConflict":
      return (
        <div>
          <p>
            <strong>
              This shortcut is already used for “
              {describeKeyboardAction(error.otherMapping.action).name}.”
            </strong>
          </p>
          <p>Press the shortcut again to replace, or choose another one!</p>
        </div>
      );

    default:
      return unreachable(error.type, error);
  }
}

type KeyboardActionDescription = {|
  name: string,
|};

export function getKeyboardActionId(action: KeyboardAction): string {
  return `action-${action}`;
}

export function describeKeyboardAction(
  action: KeyboardAction
): KeyboardActionDescription {
  switch (action) {
    case "EnterHintsMode_Click":
      return {
        name: "Click",
      };

    case "EnterHintsMode_ManyClick":
      return {
        name: "Click many",
      };

    case "EnterHintsMode_ManyTab":
      return {
        name: "Open many tabs",
      };

    case "EnterHintsMode_BackgroundTab":
      return {
        name: "Open link in new tab",
      };

    case "EnterHintsMode_ForegroundTab":
      return {
        name: "Open link in new tab and switch to it",
      };

    case "EnterHintsMode_Select":
      return {
        name: "Select element",
      };

    case "ExitHintsMode":
      return {
        name: "Exit hints mode",
      };

    case "RotateHintsForward":
      return {
        name: "Rotate hints forward",
      };

    case "RotateHintsBackward":
      return {
        name: "Rotate hints backward",
      };

    case "RefreshHints":
      return {
        name: "Refresh hints",
      };

    case "TogglePeek":
      return {
        name: "Toggle peek mode",
      };

    case "Escape":
      return {
        name: "Exit hints mode, blur elements and clear selection",
      };

    case "ActivateHint":
      return {
        name: "Activate highlighted hint",
      };

    case "ActivateHintAlt":
      return {
        name: "Activate highlighted hint in a new tab",
      };

    case "Backspace":
      return {
        name: "Erase last entered character",
      };

    case "ReverseSelection":
      return {
        name: "Swap which end of a text selection to work on",
      };

    case "ClickFocusedElement":
      return {
        name: "Fire a click on the focused element",
      };

    default:
      return unreachable(action);
  }
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// This does not allow only shift on purpose.
//
// - Shift doesn't count as a modifier for printable keys. Example: a vs A.
// - Shift + non-printable keys are generally already taken. Example:
//   Shitf+ArrowRight selects text. Exception: The keys allowed by
//   `isAllowedWithShiftOnly`.
function hasModifier(shortcut: Shortcut): boolean {
  return shortcut.alt || shortcut.cmd || shortcut.ctrl;
}

function isAllowedWithShiftOnly(shortcut: Shortcut): boolean {
  return (
    shortcut.shift && (shortcut.key === "Escape" || /^F\d+$/.test(shortcut.key))
  );
}

export function isRecognized(key: string): boolean {
  return key !== "Dead" && key !== "Unidentified";
}

function getConflictingChars(
  shortcuts: Array<Shortcut>,
  charsString: string
): Array<string> {
  const chars = charsString.split("");
  return shortcuts
    .map(shortcut =>
      hasModifier(shortcut)
        ? undefined
        : chars.find(char => char === shortcut.key)
    )
    .filter(Boolean);
}

export function getConflictingKeyboardActions(
  defaultMappings: Array<KeyboardMapping>,
  mappings: Array<KeyboardMapping>,
  charsString: string
): Array<[KeyboardAction, Array<string>]> {
  const chars = charsString.split("");
  return defaultMappings
    .map(defaultMapping => {
      const shortcuts = mappings
        .filter(mapping => mapping.action === defaultMapping.action)
        .map(mapping => mapping.shortcut);
      const conflicts = chars.filter(char =>
        shortcuts.some(
          shortcut => shortcut.key === char && !hasModifier(shortcut)
        )
      );
      return [defaultMapping.action, conflicts];
    })
    .filter(([, conflicts]) => conflicts.length > 0);
}
