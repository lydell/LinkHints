// @flow strict-local

import * as React from "preact";

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromOptions,
  ToBackground,
} from "../shared/messages";
import { type Options, type PartialOptions } from "../shared/options";
import { TextInput } from "./TextInput";

type Props = {||};

type State = {|
  options: ?Options,
  optionsErrors: Array<string>,
  hasSaved: boolean,
|};

export default class OptionsProgram extends React.Component<Props, State> {
  resets: Resets;

  constructor(props: Props) {
    super(props);

    this.resets = new Resets();

    this.state = {
      options: undefined,
      optionsErrors: [],
      hasSaved: false,
    };

    bind(this, [
      [this.onMessage, { catch: true }],
      [this.sendMessage, { catch: true }],
      [this.start, { log: true, catch: true }],
      [this.stop, { log: true, catch: true }],
    ]);
  }

  start() {
    this.resets.add(addListener(browser.runtime.onMessage, this.onMessage));

    this.sendMessage({ type: "OptionsScriptAdded" });
  }

  stop() {
    this.resets.reset();
  }

  componentDidMount() {
    this.start();
  }

  componentWillUnmount() {
    this.stop();
  }

  async sendMessage(message: FromOptions) {
    log("log", "OptionsProgram#sendMessage", message.type, message);
    await browser.runtime.sendMessage(wrapMessage(message));
  }

  onMessage(wrappedMessage: FromBackground) {
    if (wrappedMessage.type !== "ToOptions") {
      return;
    }

    const { message } = wrappedMessage;

    log("log", "OptionsProgram#onMessage", message.type, message);

    switch (message.type) {
      case "StateSync":
        log.level = message.logLevel;
        this.setState({
          options: message.options,
          optionsErrors: message.optionsErrors,
        });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  saveOptions(partialOptions: PartialOptions) {
    this.setState({ optionsErrors: [], hasSaved: true });
    this.sendMessage({
      type: "SaveOptions",
      partialOptions,
    });
  }

  render() {
    const { options, optionsErrors, hasSaved } = this.state;

    if (options == null) {
      return null;
    }

    return (
      <div>
        <label>
          Hint chars:
          <TextInput
            savedValue={options.hintsChars}
            normalize={removeDuplicateChars}
            save={value => {
              this.saveOptions({ hintsChars: value });
            }}
          />
        </label>

        {optionsErrors.length > 0 && (
          <div>
            {hasSaved ? (
              <p>Errors were encountered while saving yours options:</p>
            ) : (
              <p>Errors were encountered while reading your saved options:</p>
            )}
            <ul>
              {optionsErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
}

function wrapMessage(message: FromOptions): ToBackground {
  return {
    type: "FromOptions",
    message,
  };
}

function removeDuplicateChars(string: string): string {
  return Array.from(new Set(Array.from(string))).join("");
}
