// @flow

import * as React from "preact";

const SAVE_TIMEOUT = 200; // ms

type Reason = "input" | "blur";

type Props = {
  savedValue: string,
  normalize: string => string,
  save: (string, Reason) => void,
  // ...restProps
};

type State = {|
  value: string,
  focused: boolean,
|};

export default class TextInput extends React.Component<Props, State> {
  timeoutId: ?TimeoutID;

  constructor(props: Props) {
    super(props);

    this.state = {
      value: props.savedValue,
      focused: false,
    };

    this.timeoutId = undefined;
  }

  componentDidUpdate(prevProps: Props) {
    if (
      !this.state.focused &&
      this.props.savedValue !== prevProps.savedValue &&
      this.props.savedValue !== this.state.value
    ) {
      this.setState({ value: this.props.savedValue });
    }
  }

  save(value: string, reason: Reason) {
    const { save } = this.props;
    save(value, reason);
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
    const { savedValue, normalize, ...restProps } = this.props;
    const { value } = this.state;

    return (
      <input
        {...restProps}
        type="text"
        value={value}
        spellCheck="false"
        onInput={event => {
          const newValue = event.target.value;
          const normalizedValue = normalize(newValue);
          this.setState({ value: newValue });
          if (normalizedValue !== savedValue) {
            this.saveThrottled(normalizedValue);
          }
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
