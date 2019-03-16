// @flow strict-local

import * as React from "preact";

import { CSS, SUGGESTION_FONT_SIZE, SUGGESTION_VIMIUM } from "../shared/css";
import {
  type KeyPair,
  type KeyTranslations,
  type Keypress,
  isModifierKey,
  keyboardEventToKeypress,
} from "../shared/keyboard";
import {
  Resets,
  addListener,
  bind,
  classlist,
  log,
  unreachable,
} from "../shared/main";
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

const MIN_CHARS = 2;

const CSS_SUGGESTIONS = [
  { name: "Base CSS", value: CSS },
  { name: "Font size", value: SUGGESTION_FONT_SIZE },
  { name: "Vimium", value: SUGGESTION_VIMIUM },
];

const DUMMY_KEY = "__dummy";

type Props = {||};

type State = {|
  optionsData: ?{|
    options: Options,
    defaults: Options,
    errors: Array<string>,
  |},
  hasSaved: boolean,
  customChars: string,
  keyTranslationsInput: {|
    text: string,
    testOnly: boolean,
    lastKeypress: ?Keypress,
  |},
  peek: boolean,
  cssSuggestion: string,
|};

export default class OptionsProgram extends React.Component<Props, State> {
  resets: Resets;
  keysTableRef: ?HTMLDivElement;

  constructor(props: Props) {
    super(props);

    this.resets = new Resets();
    this.keysTableRef = undefined;

    this.state = {
      optionsData: undefined,
      hasSaved: false,
      customChars: "",
      keyTranslationsInput: {
        text: "",
        testOnly: false,
        lastKeypress: undefined,
      },
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
          customChars:
            state.optionsData == null
              ? message.options.chars
              : state.customChars,
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
      customChars,
      keyTranslationsInput,
      peek,
      cssSuggestion,
    } = this.state;

    if (optionsData == null) {
      return null;
    }

    const { options, defaults, errors } = optionsData;

    const charsPresets = [
      { name: "QWERTY (default)", value: defaults.chars },
      { name: "Dvorak", value: "hutenogacpridkmjw" },
      { name: "Colemak", value: "tnseriaoplfuwydhvmck" },
    ];

    const customIndex = charsPresets.length;

    const rawSelectedIndex = charsPresets.findIndex(
      preset => preset.value === options.chars
    );
    const selectedIndex =
      rawSelectedIndex >= 0 ? rawSelectedIndex : customIndex;

    const isLowerCase = options.chars === options.chars.toLowerCase();

    const keysChanged =
      // Both Chrome and Firefox return the keys in alphabetical order
      // when reading from storage, and the defaults are written in
      // aplphabetical order, so a simple `JSON.stringify` should be
      // enough to compare.
      JSON.stringify(options.keys) !== JSON.stringify(defaults.keys);

    const { lastKeypress } = keyTranslationsInput;
    const modifiers =
      lastKeypress != null
        ? [
            lastKeypress.alt ? "Alt" : undefined,
            lastKeypress.cmd ? "Cmd" : undefined,
            lastKeypress.ctrl ? "Ctrl" : undefined,
            lastKeypress.shift ? "Shift" : undefined,
          ].filter(Boolean)
        : [];

    return (
      <div>
        <Field
          key="chars"
          id="chars"
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
          changed={options.chars !== defaults.chars}
          render={({ id }) => (
            <div className="Spaced">
              <TextInput
                id={id}
                style={{ flex: "1 1 50%" }}
                savedValue={options.chars}
                normalize={value => {
                  const unique = pruneChars(value);
                  return unique.length >= MIN_CHARS
                    ? unique
                    : unique.length === 0
                    ? defaults.chars
                    : pruneChars(unique + defaults.chars).slice(0, MIN_CHARS);
                }}
                save={(value, reason) => {
                  if (reason === "input") {
                    this.setState({ customChars: value });
                  }
                  this.saveOptions({ chars: value });
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
                        index >= 0 && index < charsPresets.length
                          ? charsPresets[index].value
                          : customChars;
                      this.saveOptions({ chars });
                    }}
                  >
                    {charsPresets.map(({ name }, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                    {charsPresets.every(
                      preset => preset.value !== customChars
                    ) && <option value={customIndex}>Custom</option>}
                  </select>
                </Attachment>

                <button
                  type="button"
                  style={{ flex: "1 1 50%" }}
                  onClick={() => {
                    const chars = isLowerCase
                      ? options.chars.toUpperCase()
                      : options.chars.toLowerCase();
                    const unique = pruneChars(chars);
                    this.setState({ customChars: unique });
                    this.saveOptions({ chars: unique });
                  }}
                >
                  {isLowerCase ? "→ UPPERCASE" : "→ lowercase"}
                </button>
              </div>
            </div>
          )}
        />

        <Field
          key="autoActivate"
          id="autoActivate"
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
          changed={options.autoActivate !== defaults.autoActivate}
          changedRight={
            options.overTypingDuration !== defaults.overTypingDuration
          }
          render={({ id }) => (
            <div className="Spaced">
              <label
                className="Spaced Spaced--center"
                style={{ flex: "1 1 50%" }}
              >
                <input
                  type="checkbox"
                  id={id}
                  checked={options.autoActivate}
                  onChange={(event: SyntheticEvent<HTMLInputElement>) => {
                    this.saveOptions({
                      autoActivate: event.currentTarget.checked,
                    });
                  }}
                />
                <span>Enabled</span>
              </label>

              <Attachment
                label={`Over-typing duration (default: ${
                  defaults.overTypingDuration
                })`}
                style={{ flex: "1 1 50%" }}
              >
                <div
                  className="Spaced Spaced--center"
                  style={{ flex: "1 1 100%" }}
                >
                  <TextInput
                    style={{ flex: "1 1 50%" }}
                    disabled={!options.autoActivate}
                    savedValue={String(options.overTypingDuration)}
                    normalize={value => {
                      const number = Math.max(0, Math.round(parseFloat(value)));
                      return String(
                        Number.isFinite(number)
                          ? number
                          : defaults.overTypingDuration
                      );
                    }}
                    save={value => {
                      this.saveOptions({ overTypingDuration: Number(value) });
                    }}
                  />
                  <span style={{ flex: "1 1 50%" }}>milliseconds</span>
                </div>
              </Attachment>
            </div>
          )}
        />

        <Field
          key="useKeyTranslations"
          id="useKeyTranslations"
          connected={options.useKeyTranslations}
          label="Keyboard layout"
          span
          description={
            options.useKeyTranslations ? (
              <p>
                Browser extensions receive two things when you press a key: The
                actual key according to your layout, as well as a <em>code</em>{" "}
                which is a name for the <em>physical</em> key you pressed and
                always stays the same regardless of which layout you have
                enabled. Switch to your main layout and type in the textarea to
                translate such <em>codes</em> to actual keys.
              </p>
            ) : null
          }
          changed={options.useKeyTranslations !== defaults.useKeyTranslations}
          render={({ id }) => (
            <div>
              <label className="Spaced Spaced--center">
                <input
                  type="radio"
                  name={id}
                  checked={!options.useKeyTranslations}
                  onChange={() => {
                    this.saveOptions({
                      useKeyTranslations: false,
                    });
                  }}
                />
                <span>I use a single keyboard layout</span>
              </label>

              <label className="Spaced Spaced--center" style={{ marginTop: 4 }}>
                <input
                  type="radio"
                  name={id}
                  checked={options.useKeyTranslations}
                  onChange={() => {
                    this.saveOptions({
                      useKeyTranslations: true,
                    });
                  }}
                />
                <span>I use multiple keyboard layouts</span>
              </label>
            </div>
          )}
        />

        {options.useKeyTranslations && (
          <Field
            key="keys"
            id="keys"
            connected
            label={
              keyTranslationsInput.testOnly
                ? "Type here to test your translations"
                : "Type here to translate codes to keys"
            }
            description={null}
            changed={keysChanged}
            render={({ id }) => (
              <div className="Spaced">
                <div className="SpacedVertical" style={{ flex: "1 1 50%" }}>
                  <Attachment
                    style={{ flexGrow: "1" }}
                    content={
                      <div className="TinyLabel Spaced">
                        <label
                          className="Spaced Spaced--center"
                          style={{ marginLeft: "auto" }}
                        >
                          <span>Test only</span>
                          <input
                            type="checkbox"
                            value={keyTranslationsInput.testOnly}
                            onChange={(
                              event: SyntheticEvent<HTMLInputElement>
                            ) => {
                              this.setState({
                                keyTranslationsInput: {
                                  ...keyTranslationsInput,
                                  testOnly: event.currentTarget.checked,
                                },
                              });
                            }}
                          />
                        </label>
                      </div>
                    }
                  >
                    <textarea
                      id={id}
                      spellCheck="false"
                      className="TextSmall"
                      style={{ resize: "none" }}
                      placeholder={
                        keyTranslationsInput.testOnly
                          ? "Type with another layout…"
                          : "Type with your main layout…"
                      }
                      value={keyTranslationsInput.text}
                      onInput={(
                        event: SyntheticInputEvent<
                          HTMLInputElement | HTMLTextAreaElement
                        >
                      ) => {
                        event.currentTarget.value = keyTranslationsInput.text;
                      }}
                      onBlur={() => {
                        this.setState({
                          keyTranslationsInput: {
                            ...keyTranslationsInput,
                            text: "",
                          },
                        });
                      }}
                      onKeyDown={(event: KeyboardEvent) => {
                        event.preventDefault();
                        const keypress = keyboardEventToKeypress(event);
                        const { code, key, shift } = keypress;
                        if (isModifierKey(key)) {
                          return;
                        }
                        const {
                          keyTranslations: keys,
                          key: finalKey,
                        } = updateKeyTranslations(
                          { code, key, shift },
                          options.keys
                        );
                        if (keys != null && !keyTranslationsInput.testOnly) {
                          this.saveOptions({ keys });
                        }
                        this.setState(
                          {
                            keyTranslationsInput: {
                              ...keyTranslationsInput,
                              text: `${
                                keyTranslationsInput.text
                              } ${finalKey}`.trimLeft(),
                              lastKeypress: keypress,
                            },
                          },
                          () => {
                            if (!keyTranslationsInput.testOnly) {
                              this.scrollKeyIntoView(code);
                            }
                          }
                        );
                      }}
                    />
                  </Attachment>

                  {lastKeypress != null && (
                    <div>
                      <p className="TinyLabel">Last received keypress data</p>

                      <table className="KeypressTable TextSmall">
                        <tbody>
                          <tr>
                            <th>Code</th>
                            <td>{lastKeypress.code}</td>
                          </tr>
                          <tr>
                            <th>Key</th>
                            <td>{lastKeypress.key}</td>
                          </tr>
                          <tr>
                            <th>Modifiers</th>
                            <td style={{ paddingTop: 0, paddingBottom: 0 }}>
                              {modifiers.length > 0 && (
                                <div className="Spaced">
                                  {modifiers.map(modifier => (
                                    <kbd key={modifier}>{modifier}</kbd>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <Attachment
                  content={
                    <div className="Spaced Spaced--end TinyLabel">
                      <span>Key translations</span>

                      <span style={{ marginLeft: "auto" }}>
                        {keysChanged ? (
                          <button
                            type="button"
                            onClick={() => {
                              this.saveOptions({ keys: defaults.keys });
                              if (this.keysTableRef != null) {
                                this.keysTableRef.scrollTop = 0;
                              }
                            }}
                          >
                            Reset to defaults (en-US QWERTY)
                          </button>
                        ) : (
                          <em>Using defaults (en-US QWERTY)</em>
                        )}
                      </span>
                    </div>
                  }
                  style={{ flex: "1 1 50%" }}
                >
                  <div
                    className={classlist("KeysTable", "TextSmall", {
                      "is-disabled": keyTranslationsInput.testOnly,
                    })}
                    ref={ref => {
                      this.keysTableRef = ref;
                    }}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Actual key</th>
                          <th>Shifted</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(options.keys).map(code => {
                          if (code === DUMMY_KEY) {
                            return null;
                          }
                          const [unshifted, shifted] = options.keys[code];
                          const {
                            [code]: [defaultUnshifted, defaultShifted] = [
                              undefined,
                              undefined,
                            ],
                          } = defaults.keys;
                          const changed =
                            unshifted !== defaultUnshifted ||
                            shifted !== defaultShifted;
                          return (
                            <tr key={code} id={makeKeysRowId(code)}>
                              <td
                                className={classlist({ "is-changed": changed })}
                              >
                                {code}
                              </td>
                              <td>{unshifted}</td>
                              <td>{shifted}</td>
                              <td>
                                <button
                                  type="button"
                                  title="Remove this key translation"
                                  className="RemoveButton"
                                  disabled={keyTranslationsInput.testOnly}
                                  onClick={() => {
                                    const {
                                      [code]: removed,
                                      ...newKeyTranslations
                                    } = options.keys;
                                    this.saveOptions({
                                      keys:
                                        Object.keys(newKeyTranslations).length >
                                        0
                                          ? newKeyTranslations
                                          : // Empty `options.keys` cannot be
                                            // distinguished from missing
                                            // `options.keys`, so save a dummy key
                                            // in this case.
                                            { [DUMMY_KEY]: ["", ""] },
                                    });
                                  }}
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Attachment>
              </div>
            )}
          />
        )}

        <Field
          key="css"
          id="css"
          label="Appearance"
          description={null}
          changed={options.css !== defaults.css}
          render={({ id }) => (
            <div className="SpacedVertical">
              <div className="Spaced">
                <TextInput
                  textarea
                  className="TextSmall"
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
                  <TextInput
                    textarea
                    className="TextSmall"
                    savedValue={cssSuggestion}
                  />
                </Attachment>
              </div>

              <p className="TextSmall">
                To the left, you can add or copy and paste CSS overrides to
                change the look of things. To the right, you’ll find the base
                CSS for reference, as well as some inspiration through the
                dropdown.
              </p>

              <div>
                <div className="TinyLabel Spaced">
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
                  chars={options.chars}
                  css={options.css}
                  peek={peek}
                />
              </div>
            </div>
          )}
        />

        {/* TODO: Style these and show them somewhere where they’re more noticeable. */}
        {errors.length > 0 && (
          <div style={{ padding: 30 }}>
            {hasSaved ? (
              <p>Errors were encountered while saving yours options:</p>
            ) : (
              <p>Errors were encountered while reading your saved options:</p>
            )}
            <ul>
              {errors.map((error, index) => (
                <li key={index}>
                  <pre>{error}</pre>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  scrollKeyIntoView(code: string) {
    const id = makeKeysRowId(code);
    const element = document.getElementById(id);
    const keysTable = this.keysTableRef;

    if (keysTable == null || element == null) {
      return;
    }

    element.classList.remove("is-animated");

    const elementRect = element.getBoundingClientRect();
    const keysTableRect = keysTable.getBoundingClientRect();
    const headingsHeight = Math.max(
      0,
      ...Array.from(
        keysTable.querySelectorAll("thead th"),
        th => th.offsetHeight
      )
    );

    const diffTop = elementRect.top - keysTableRect.top - headingsHeight;
    const diffBottom = elementRect.bottom - keysTableRect.bottom;

    if (diffTop < 0) {
      keysTable.scrollTop += diffTop;
    } else if (diffBottom > 0) {
      keysTable.scrollTop += diffBottom;
    }

    element.classList.add("is-animated");
  }
}

function wrapMessage(message: FromOptions): ToBackground {
  return {
    type: "FromOptions",
    message,
  };
}

function pruneChars(string: string): string {
  return Array.from(new Set(Array.from(string.replace(/\s/g, "")))).join("");
}

function updateKeyTranslations(
  { code, key, shift }: {| code: string, key: string, shift: boolean |},
  keyTranslations: KeyTranslations
): {| keyTranslations: ?KeyTranslations, key: string |} {
  const previousPair = {}.hasOwnProperty.call(keyTranslations, code)
    ? keyTranslations[code]
    : undefined;

  const newPair = updatePair({ key, shift }, previousPair);
  const changed = previousPair == null || !pairsEqual(newPair, previousPair);
  const newKeyTranslations = changed
    ? sortKeyTranslations({ ...keyTranslations, [code]: newPair })
    : undefined;

  const [unshifted, shifted] = newPair;

  return {
    keyTranslations: newKeyTranslations,
    key: shift ? shifted : unshifted,
  };
}

function updatePair(
  { key, shift }: {| key: string, shift: boolean |},
  previousPair: ?KeyPair
): KeyPair {
  if (!shift && key.length === 1 && key.toLowerCase() !== key.toUpperCase()) {
    return [key, key.toUpperCase()];
  }
  if (previousPair != null) {
    const [unshifted, shifted] = previousPair;
    return shift ? [unshifted, key] : [key, shifted];
  }
  return [key, key];
}

function pairsEqual(
  [a1, b1]: [string, string],
  [a2, b2]: [string, string]
): boolean {
  return a1 === a2 && b1 === b2;
}

function sortKeyTranslations(
  keyTranslations: KeyTranslations
): KeyTranslations {
  const keys = Object.keys(keyTranslations).sort();
  return keys.reduce((result, key) => {
    result[key] = keyTranslations[key];
    return result;
  }, {});
}

function makeKeysRowId(code: string): string {
  return `KeysTable-row-${code}`;
}
