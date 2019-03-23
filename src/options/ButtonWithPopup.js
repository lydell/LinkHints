// @flow strict-local

import * as React from "preact";

import { Resets, addEventListener, classlist } from "../shared/main";

type Props = {
  buttonContent: React.Node,
  onChange: boolean => void,
  children: React.Node,
  // ...restProps passed on to the `<button>`.
};

type State = {|
  open: boolean,
|};

export default class ButtonsWithPopup extends React.Component<Props, State> {
  state = {
    open: false,
  };

  resets: Resets = new Resets();
  rootRef: { current: HTMLDivElement | null } = React.createRef();

  componentDidUpdate(prevProps: Props, prevState: State) {
    const { onChange } = this.props;
    const { open } = this.state;

    if (open !== prevState.open) {
      if (open) {
        this.resets.add(
          addEventListener(window, "focus", this.closeIfOutside),
          addEventListener(window, "click", this.closeIfOutside)
        );
      } else {
        this.resets.reset();
      }
      onChange(open);
    }
  }

  componentWillUnmount() {
    this.resets.reset();
  }

  render() {
    const { buttonContent, children, ...restProps } = this.props;
    const { open } = this.state;

    return (
      <div
        className={classlist("ButtonWithPopup", { "is-open": open })}
        ref={this.rootRef}
      >
        <button
          {...restProps}
          type="button"
          className="ButtonWithPopup-button"
          onClick={() => {
            this.setState({ open: !open });
          }}
        >
          {buttonContent}
        </button>

        {open && <div className="ButtonWithPopup-popup">{children}</div>}
      </div>
    );
  }

  closeIfOutside = (event: Event) => {
    const root = this.rootRef.current;
    const { target } = event;

    if (root != null && target instanceof Node && !root.contains(target)) {
      this.setState({ open: false });
    }
  };
}
