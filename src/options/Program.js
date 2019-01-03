// @flow strict-local

import { Component, createElement } from "preact";

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromOptions,
  ToBackground,
} from "../shared/messages";
import { type Options, type PartialOptions } from "../shared/options";
import { TextInput } from "./TextInput";

const h = createElement;
const makeElement = tag => (...rest) => h(tag, ...rest);

const div = makeElement("div");
const label = makeElement("label");

type Props = {||};

type State = {| options: ?Options |};

export default class OptionsProgram extends Component<Props, State> {
  resets: Resets;

  constructor(props: Props) {
    super(props);

    this.resets = new Resets();

    this.state = {
      options: undefined,
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

  async sendMessage(message: FromOptions): Promise<void> {
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
        this.setState({ options: message.options });
        break;

      default:
        unreachable(message.type, message);
    }
  }

  saveOptions(partialOptions: PartialOptions) {
    this.sendMessage({
      type: "SaveOptions",
      partialOptions,
    });
  }

  render() {
    const { options } = this.state;

    if (options == null) {
      return null;
    }

    return div(
      label(
        {},
        "Hint chars:",
        h(TextInput, {
          savedValue: options.hintsChars,
          normalize: removeDuplicateChars,
          save: value => {
            this.saveOptions({ hintsChars: value });
          },
        })
      )
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
