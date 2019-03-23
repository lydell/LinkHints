// @flow strict-local

import * as React from "preact";

import {
  type KeyboardAction,
  type KeyboardMapping,
  serializeShortcut,
} from "../shared/keyboard";
import { classlist, deepEqual, unreachable } from "../shared/main";
import ButtonWithPopup from "./ButtonWithPopup";
import Field from "./Field";
import KeyboardShortcut from "./KeyboardShortcut";

type Props = {|
  id: string,
  name: string,
  mac: boolean,
  requireModifiers: boolean,
  mappings: Array<KeyboardMapping>,
  defaultMappings: Array<KeyboardMapping>,
  onChange: (Array<KeyboardMapping>) => void,
|};

type State = {||};

export default class KeyboardShortcuts extends React.Component<Props, State> {
  static defaultProps = {
    requireModifiers: false,
  };

  render() {
    const {
      id,
      name,
      mac,
      // requireModifiers,
      mappings,
      defaultMappings,
      onChange,
    } = this.props;

    return (
      <Field
        id={id}
        fullWidth
        label={name}
        span
        description={null}
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

                  return (
                    <tr key={index}>
                      <th className={classlist({ "is-changed": changed })}>
                        {describeKeyboardAction(defaultMapping.action).name}
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
                              buttonContent={<strong>+</strong>}
                              onChange={open => {
                                console.log("COP", open);
                              }}
                            >
                              Test
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

type KeyboardActionDescription = {|
  name: string,
|};

function describeKeyboardAction(
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
