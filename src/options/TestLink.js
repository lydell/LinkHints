// @flow strict-local

import * as React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  text: string,
|};

type State = {|
  clicked: boolean,
|};

const params = new URLSearchParams(window.location.search);

export default class TestLinks extends React.Component<Props, State> {
  state = {
    clicked: false,
  };

  render() {
    const { text } = this.props;
    const { clicked } = this.state;

    const id = text.toLowerCase().replace(/\W+/g, "-");

    return (
      <a
        href={`?test=${id}`}
        tabIndex="-1"
        className={classlist("TestLink", { "is-clicked": clicked })}
        onClick={event => {
          event.preventDefault();
          this.setState({ clicked: true });
        }}
        onBlur={() => {
          this.setState({ clicked: false });
        }}
      >
        {text}
        {params.get("test") === id ? "\u00a0✅" : ""}
      </a>
    );
  }
}
