// @flow strict-local

import * as React from "preact";

import { deepEqual } from "../shared/main";
import TextInput from "./TextInput";

type Reason = "input" | "blur";

type Props = {
  savedValue: Set<string>,
  save: (Array<string>, Reason) => void,
  id?: string,
};

type State = {|
  value: Array<string> | void,
|};

export default class StringSetEditor extends React.Component<Props, State> {
  timeoutId: ?TimeoutID = undefined;

  state = {
    value: undefined,
  };

  maybeNormalize() {
    if (this.timeoutId == null) {
      this.timeoutId = setTimeout(() => {
        this.timeoutId = undefined;
        this.setState({ value: undefined });
      }, 0);
    }
  }

  abortNormalize() {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
  }

  componentWillUnmount() {
    this.abortNormalize();
  }

  render() {
    const { save, id, savedValue } = this.props;
    const { value = normalizeStringSet(savedValue) } = this.state;

    const endsWithBlank =
      value.length > 0 && value[value.length - 1].trim() === "";

    return (
      <div
        className="SpacedVertical"
        onBlurCapture={() => {
          this.maybeNormalize();
        }}
        onFocusCapture={() => {
          this.abortNormalize();
        }}
      >
        {value.concat(endsWithBlank ? [] : [""]).map((item, index) => (
          <TextInput
            key={index}
            id={index === 0 ? id : undefined}
            savedValue={item}
            normalize={newValue => newValue.trim()}
            save={(newItem, reason) => {
              const newValue =
                index === value.length
                  ? newItem.trim() === ""
                    ? value
                    : value.concat(newItem)
                  : value.map((item2, index2) =>
                      index2 === index ? newItem : item2
                    );
              this.setState({ value: newValue });
              save(newValue, reason);
            }}
            onKeyDown={event => {
              const { target } = event;
              if (target instanceof HTMLElement && event.key === "Enter") {
                const next = target.nextElementSibling;
                if (next instanceof HTMLInputElement) {
                  next.select();
                }
              }
            }}
          />
        ))}
      </div>
    );
  }
}

function normalizeStringSet(set: Set<string>): Array<string> {
  return Array.from(set).sort();
}

export function equalStringSets(a: Set<string>, b: Set<string>): boolean {
  return deepEqual(normalizeStringSet(a), normalizeStringSet(b));
}
