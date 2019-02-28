// @flow strict-local

import * as React from "preact";

import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromOptions,
  ToBackground,
} from "../shared/messages";
import { type Options, type PartialOptions } from "../shared/options";
import ExtraLabel from "./ExtraLabel";
import Field from "./Field";
import Select from "./Select";
import TextInput from "./TextInput";

const MIN_HINTS_CHARS = 2;

type Props = {||};

type State = {|
  optionsData: ?{|
    options: Options,
    defaults: Options,
    errors: Array<string>,
  |},
  hasSaved: boolean,
  customHintsChars: string,
|};

export default class OptionsProgram extends React.Component<Props, State> {
  resets: Resets;

  constructor(props: Props) {
    super(props);

    this.resets = new Resets();

    this.state = {
      optionsData: undefined,
      hasSaved: false,
      customHintsChars: "",
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

    const { documentElement } = document;
    if (documentElement != null) {
      documentElement.classList.add(BROWSER);
    }

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
        this.setState(state => ({
          optionsData: {
            options: message.options,
            defaults: message.defaults,
            errors: message.errors,
          },
          customHintsChars:
            state.optionsData == null
              ? message.options.hintsChars
              : state.customHintsChars,
        }));
        break;

      default:
        unreachable(message.type, message);
    }
  }

  saveOptions(partialOptions: PartialOptions) {
    this.setState(state => ({
      optionsData:
        state.optionsData == null
          ? undefined
          : {
              ...state.optionsData,
              options: {
                ...state.optionsData.options,
                ...partialOptions,
              },
              errors: [],
            },
      hasSaved: true,
    }));
    this.sendMessage({
      type: "SaveOptions",
      partialOptions,
    });
  }

  render() {
    const { optionsData, hasSaved, customHintsChars } = this.state;

    if (optionsData == null) {
      return null;
    }

    const { options, defaults, errors } = optionsData;

    const hintsCharsPresets = [
      { name: "Default", value: defaults.hintsChars },
      { name: "Uppercase", value: defaults.hintsChars.toUpperCase() },
      { name: "Vimium", value: "sadfjklewcmpgh" },
    ];

    const customIndex = hintsCharsPresets.length;

    const rawSelectedIndex = hintsCharsPresets.findIndex(
      preset => preset.value === options.hintsChars
    );
    const selectedIndex =
      rawSelectedIndex >= 0 ? rawSelectedIndex : customIndex;

    return (
      <div>
        <Field
          id="hintsChars"
          label="Hint chars"
          topDescription={null}
          bottomDescription={null}
          changed={options.hintsChars !== defaults.hintsChars}
          render={({ id }) => (
            <div className="Spaced">
              <TextInput
                id={id}
                savedValue={options.hintsChars}
                normalize={value => {
                  const unique = pruneHintsChars(value);
                  return unique.length >= MIN_HINTS_CHARS
                    ? unique
                    : pruneHintsChars(unique + defaults.hintsChars).slice(
                        0,
                        MIN_HINTS_CHARS
                      );
                }}
                save={(value, reason) => {
                  if (reason === "input") {
                    this.setState({ customHintsChars: value });
                  }
                  this.saveOptions({ hintsChars: value });
                }}
              />

              <ExtraLabel label="Presets">
                <Select
                  value={selectedIndex}
                  onChange={value => {
                    const index = Number(value);
                    const chars =
                      index >= 0 && index < hintsCharsPresets.length
                        ? hintsCharsPresets[index].value
                        : customHintsChars;
                    this.saveOptions({ hintsChars: chars });
                  }}
                >
                  {hintsCharsPresets.map(({ name }, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                  {hintsCharsPresets.every(
                    preset => preset.value !== customHintsChars
                  ) && <option value={customIndex}>Custom</option>}
                </Select>
              </ExtraLabel>
            </div>
          )}
        />

        {errors.length > 0 && (
          <div>
            {hasSaved ? (
              <p>Errors were encountered while saving yours options:</p>
            ) : (
              <p>Errors were encountered while reading your saved options:</p>
            )}
            <ul>
              {errors.map((error, index) => (
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

function pruneHintsChars(string: string): string {
  return Array.from(new Set(Array.from(string.replace(/\s/g, "")))).join("");
}
