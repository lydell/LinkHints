// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

const SAVE_TIMEOUT = 200; // ms

type Reason = "input" | "blur";

type Props = {
  savedValue: string,
  normalize: string => string,
  save: ?(string, Reason) => void,
  textarea: boolean,
  className: string,
  // ...restProps
};

type State = {|
  value: string,
  focused: boolean,
|};

export default class TextInput extends React.Component<Props, State> {
  static defaultProps = {
    normalize: (string: string) => string,
    save: undefined,
    textarea: false,
    className: "",
  };

  timeoutId: ?TimeoutID = undefined;
  selectionStart: number = 0;
  selectionEnd: number = 0;
  ref: ?(HTMLInputElement | HTMLTextAreaElement) = undefined;

  state = {
    value: this.props.savedValue,
    focused: false,
  };

  componentDidMount() {
    // Move the default cursor position from the end of the textarea to the start.
    if (this.props.textarea) {
      this.restoreSelection();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (
      !this.state.focused &&
      this.props.savedValue !== prevProps.savedValue &&
      this.props.savedValue !== this.state.value
    ) {
      this.setState({ value: this.props.savedValue }, () => {
        // When readonly textareas change, move the cursor back to the start.
        if (this.props.textarea && this.props.save == null) {
          this.selectionStart = 0;
          this.selectionEnd = 0;
          setTimeout(() => {
            this.restoreSelection();
          }, 0);
        }
      });
    }
  }

  storeSelection() {
    const element = this.ref;
    if (element != null) {
      this.selectionStart = element.selectionStart;
      this.selectionEnd = element.selectionEnd;
    }
  }

  restoreSelection() {
    const element = this.ref;
    if (element != null) {
      element.selectionStart = this.selectionStart;
      element.selectionEnd = this.selectionEnd;
    }
  }

  save(value: string, reason: Reason) {
    const { save } = this.props;
    if (save != null) {
      save(value, reason);
    }
  }

  saveThrottled(value: string) {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined;
      this.save(value, "input");
    }, SAVE_TIMEOUT);
  }

  render() {
    const {
      savedValue,
      normalize,
      save,
      textarea,
      className,
      ...restProps
    } = this.props;
    const { value } = this.state;
    const Tag = textarea ? "textarea" : "input";
    const readonly = save == null;

    return (
      <Tag
        {...restProps}
        ref={ref => {
          this.ref = ref;
        }}
        className={classlist(className, { "is-readonly": readonly })}
        value={value}
        spellCheck="false"
        onInput={(
          event: SyntheticInputEvent<HTMLInputElement | HTMLTextAreaElement>
        ) => {
          if (readonly) {
            // This is like the `readonly` attribute, but with a visible cursor,
            // which is nice when selecting parts of the text for copying.
            event.currentTarget.value = value;
            this.restoreSelection();
          } else {
            const newValue = event.target.value;
            const normalizedValue = normalize(newValue);
            this.setState({ value: newValue });
            if (normalizedValue !== savedValue) {
              this.saveThrottled(normalizedValue);
            }
          }
        }}
        onKeyDown={() => {
          this.storeSelection();
        }}
        onMouseDown={() => {
          this.storeSelection();
        }}
        onFocus={() => {
          this.setState({ focused: true });
        }}
        onBlur={() => {
          const normalizedValue = normalize(value);
          this.setState({ focused: false, value: normalizedValue });
          if (normalizedValue !== savedValue) {
            if (this.timeoutId != null) {
              clearTimeout(this.timeoutId);
              this.timeoutId = undefined;
            }
            this.save(normalizedValue, "blur");
          }
        }}
      />
    );
  }
}
