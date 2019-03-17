// @flow strict-local

import * as React from "preact";

import { type KeyboardAction, type KeyboardMapping } from "../shared/keyboard";
import { unreachable } from "../shared/main";
import Field from "./Field";
import KeyboardShortcut from "./KeyboardShortcut";

type Props = {|
  id: string,
  name: string,
  mac: boolean,
  requireModifiers: boolean,
  shortcuts: Array<KeyboardMapping>,
  defaultShortcuts: Array<KeyboardMapping>,
|};

type State = {||};

const defaultProps = {
  requireModifiers: false,
};

export default class KeyboardShortcuts extends React.Component<Props, State> {
  static defaultProps: typeof defaultProps;

  // constructor(props: Props) {
  //   super(props);
  //
  //   this.state = {};
  // }

  render() {
    const {
      id,
      name,
      mac,
      // requireModifiers,
      // shortcuts,
      defaultShortcuts,
    } = this.props;

    return (
      <Field
        id={id}
        label={name}
        span
        description={null}
        changed={false}
        render={() => (
          <div className="SpacedVertical">
            {defaultShortcuts.map((mapping, index) => {
              return (
                <div key={index} className="Spaced">
                  <KeyboardShortcut mac={mac} shortcut={mapping.shortcut} />{" "}
                  {describeKeyboardAction(mapping.action).name}
                </div>
              );
            })}
          </div>
        )}
      />
    );
  }
}

KeyboardShortcuts.defaultProps = defaultProps;

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
        name: "Exit hints mode, blur active element and clear selection",
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
