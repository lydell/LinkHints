// @flow strict-local

import * as React from "preact";

import { CSS, SUGGESTION_FONT_SIZE, SUGGESTION_VIMIUM } from "../shared/css";
import { Resets, addListener, bind, log, unreachable } from "../shared/main";
import type {
  FromBackground,
  FromOptions,
  ToBackground,
} from "../shared/messages";
import { type Options, type PartialOptions } from "../shared/options";
import Attachment from "./Attachment";
import CSSPreview from "./CSSPreview";
import Field from "./Field";
import TextInput from "./TextInput";

const MIN_HINTS_CHARS = 2;

const CSS_SUGGESTIONS = [
  { name: "Base CSS", value: CSS },
  { name: "Font size", value: SUGGESTION_FONT_SIZE },
  { name: "Vimium", value: SUGGESTION_VIMIUM },
];

type Props = {||};

type State = {|
  optionsData: ?{|
    options: Options,
    defaults: Options,
    errors: Array<string>,
  |},
  hasSaved: boolean,
  customHintsChars: string,
  peek: boolean,
  cssSuggestion: string,
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
      peek: false,
      cssSuggestion: CSS_SUGGESTIONS[0].value,
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
    const {
      optionsData,
      hasSaved,
      customHintsChars,
      peek,
      cssSuggestion,
    } = this.state;

    if (optionsData == null) {
      return null;
    }

    const { options, defaults, errors } = optionsData;

    const hintsCharsPresets = [
      { name: "QWERTY (default)", value: defaults.hintsChars },
      { name: "Dvorak", value: "hutenogacpridkmjw" },
      { name: "Colemak", value: "tnseriaoplfuwydhvmck" },
    ];

    const customIndex = hintsCharsPresets.length;

    const rawSelectedIndex = hintsCharsPresets.findIndex(
      preset => preset.value === options.hintsChars
    );
    const selectedIndex =
      rawSelectedIndex >= 0 ? rawSelectedIndex : customIndex;

    const isLowerCase = options.hintsChars === options.hintsChars.toLowerCase();

    return (
      <div>
        <Field
          id="hintsChars"
          label="Hint characters"
          description={
            <div>
              <p>
                Use the characters you find the easiest to type. Put the best
                ones further to the left. All <em>other</em> characters are used
                to match elements by their <em>text.</em> Lowercase vs uppercase
                matters when typing <em>hint characters</em>, but not when{" "}
                <em>filtering by text.</em>
              </p>
              {isLowerCase && (
                <p>
                  <strong>Note:</strong> The hints are <em>displayed</em>{" "}
                  uppercase because it looks nicer. 😎
                </p>
              )}
            </div>
          }
          changed={options.hintsChars !== defaults.hintsChars}
          render={({ id }) => (
            <div className="Spaced">
              <TextInput
                id={id}
                style={{ flex: "1 1 50%" }}
                savedValue={options.hintsChars}
                normalize={value => {
                  const unique = pruneHintsChars(value);
                  return unique.length >= MIN_HINTS_CHARS
                    ? unique
                    : unique.length === 0
                    ? defaults.hintsChars
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

              <div className="Spaced" style={{ flex: "1 1 50%" }}>
                <Attachment label="Presets" style={{ flex: "1 1 50%" }}>
                  <select
                    style={{ flexGrow: 1 }}
                    value={selectedIndex}
                    onChange={(event: SyntheticEvent<HTMLSelectElement>) => {
                      const index = Number(event.currentTarget.value);
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
                  </select>
                </Attachment>

                <button
                  type="button"
                  style={{ flex: "1 1 50%" }}
                  onClick={() => {
                    const chars = isLowerCase
                      ? options.hintsChars.toUpperCase()
                      : options.hintsChars.toLowerCase();
                    const unique = pruneHintsChars(chars);
                    this.setState({ customHintsChars: unique });
                    this.saveOptions({ hintsChars: unique });
                  }}
                >
                  {isLowerCase ? "→ UPPERCASE" : "→ lowercase"}
                </button>
              </div>
            </div>
          )}
        />

        <Field
          id="hintsAutoActivate"
          label="Auto activate when filtering by text"
          description={
            <p>
              When <em>filtering by text</em> you can press <kbd>Enter</kbd> to
              activate the matched hint (highlighted in green). With this option
              enabled, the matched hint is automatically activated if it is the
              only match. Many times one might type a few extra characters
              before realizing that a hint was automatically activated, so your
              key strokes are suppressed for a short period just after
              activation.
            </p>
          }
          changed={options.hintsAutoActivate !== defaults.hintsAutoActivate}
          changedRight={options.hintsTimeout !== defaults.hintsTimeout}
          render={({ id }) => (
            <div className="Spaced">
              <label
                className="Spaced Spaced--center"
                style={{ flex: "1 1 50%" }}
              >
                <input
                  type="checkbox"
                  id={id}
                  checked={options.hintsAutoActivate}
                  onChange={(event: SyntheticEvent<HTMLInputElement>) => {
                    this.saveOptions({
                      hintsAutoActivate: event.currentTarget.checked,
                    });
                  }}
                />
                <span>Enabled</span>
              </label>

              <Attachment
                label={`Over-typing duration (default: ${
                  defaults.hintsTimeout
                })`}
                style={{ flex: "1 1 50%" }}
              >
                <div
                  className="Spaced Spaced--center"
                  style={{ flex: "1 1 100%" }}
                >
                  <TextInput
                    style={{ flex: "1 1 50%" }}
                    disabled={!options.hintsAutoActivate}
                    savedValue={String(options.hintsTimeout)}
                    normalize={value => {
                      const number = Math.max(0, Math.round(parseFloat(value)));
                      return String(
                        Number.isFinite(number) ? number : defaults.hintsTimeout
                      );
                    }}
                    save={value => {
                      this.saveOptions({ hintsTimeout: Number(value) });
                    }}
                  />
                  <span style={{ flex: "1 1 50%" }}>milliseconds</span>
                </div>
              </Attachment>
            </div>
          )}
        />

        <Field
          id="css"
          label="Appearance"
          description={null}
          changed={options.css !== defaults.css}
          render={({ id }) => (
            <div>
              <div className="Spaced">
                <TextInput
                  textarea
                  placeholder="Write or copy and paste CSS overrides here…"
                  style={{ flex: "1 1 50%", height: 310 }}
                  id={id}
                  savedValue={options.css}
                  save={value => {
                    this.saveOptions({ css: value });
                  }}
                />

                <Attachment
                  content={
                    <div className="Spaced TinyLabel">
                      <select
                        value={cssSuggestion}
                        onChange={(
                          event: SyntheticEvent<HTMLSelectElement>
                        ) => {
                          this.setState({
                            cssSuggestion: event.currentTarget.value,
                          });
                        }}
                      >
                        {CSS_SUGGESTIONS.map(({ name, value }) => (
                          <option key={name} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          this.saveOptions({
                            css:
                              options.css.trim() === ""
                                ? cssSuggestion
                                : `${options.css.replace(
                                    /\n\s*$/,
                                    ""
                                  )}\n\n${cssSuggestion}`,
                          });
                        }}
                      >
                        Copy over
                      </button>
                    </div>
                  }
                  style={{ flex: "1 1 50%" }}
                >
                  <TextInput textarea savedValue={cssSuggestion} />
                </Attachment>
              </div>

              <p className="Field-description">
                To the left, you can add or copy and paste CSS overrides to
                change the look of things. To the right, you’ll find the base
                CSS for reference, as well as some inspiration through the
                dropdown.
              </p>

              <div className="TinyLabel Spaced" style={{ marginTop: 10 }}>
                <p>Preview</p>

                <label
                  className="Spaced Spaced--center"
                  style={{ marginLeft: "auto" }}
                >
                  <span>Peek</span>
                  <input
                    type="checkbox"
                    value={peek}
                    onChange={(event: SyntheticEvent<HTMLInputElement>) => {
                      this.setState({ peek: event.currentTarget.checked });
                    }}
                  />
                </label>
              </div>

              <CSSPreview
                hintsChars={options.hintsChars}
                css={options.css}
                peek={peek}
              />
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