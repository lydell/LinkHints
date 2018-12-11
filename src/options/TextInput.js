// @flow

import { Component, createElement } from "preact";

const h = createElement;
const makeElement = tag => (...rest) => h(tag, ...rest);

const input = makeElement("input");

const SAVE_TIMEOUT = 200; // ms

type Props = {|
  savedValue: string,
  normalize: string => string,
  save: string => void,
|};

type State = {|
  value: string,
  focused: boolean,
|};

export class TextInput extends Component<Props, State> {
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

  save(value: string) {
    const { save } = this.props;
    save(value);
  }

  saveThrottled(value: string) {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.timeoutId = undefined;
      this.save(value);
    }, SAVE_TIMEOUT);
  }

  render() {
    const { savedValue, normalize } = this.props;
    const { value } = this.state;

    return input({
      type: "text",
      value,
      onInput: event => {
        const newValue = event.target.value;
        const normalizedValue = normalize(newValue);
        this.setState({ value: newValue });
        if (normalizedValue !== savedValue) {
          this.saveThrottled(normalizedValue);
        }
      },
      onFocus: () => {
        this.setState({ focused: true });
      },
      onBlur: () => {
        const normalizedValue = normalize(value);
        this.setState({ focused: false, value: normalizedValue });
        if (normalizedValue !== savedValue) {
          if (this.timeoutId != null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = undefined;
          }
          this.save(normalizedValue);
        }
      },
    });
  }
}
