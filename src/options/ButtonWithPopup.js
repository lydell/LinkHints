// @flow strict-local

import * as React from "preact";

import { addEventListener, classlist, Resets } from "../shared/main";

type Props = {
  buttonContent: React.Node,
  popupContent: ({| close: () => void |}) => React.Node,
  open?: boolean,
  onChange?: boolean => void,
  className?: string,
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
    const { open = this.state.open } = this.props;
    const { open: prevOpen = prevState.open } = prevProps;

    if (open !== prevOpen) {
      if (open) {
        this.resets.add(
          addEventListener(window, "focus", this.closeIfOutside),
          addEventListener(window, "click", this.closeIfOutside)
        );
      } else {
        this.resets.reset();
      }
    }
  }

  componentWillUnmount() {
    this.resets.reset();
  }

  render() {
    const {
      open = this.state.open,
      buttonContent,
      popupContent,
      onChange,
      className = "",
      ...restProps
    } = this.props;

    return (
      <div
        className={classlist("ButtonWithPopup", { "is-open": open })}
        ref={this.rootRef}
      >
        <button
          {...restProps}
          type="button"
          className={classlist("ButtonWithPopup-button", className)}
          onClick={() => {
            this.setOpen(!open);
          }}
        >
          {buttonContent}
        </button>

        {open && (
          <div className="ButtonWithPopup-popup">
            {popupContent({
              close: () => {
                this.setOpen(false);
              },
            })}
          </div>
        )}
      </div>
    );
  }

  closeIfOutside = (event: Event) => {
    const root = this.rootRef.current;
    const { target } = event;

    if (
      root != null &&
      target instanceof Node &&
      !root.contains(target) &&
      target !== document
    ) {
      this.setOpen(false);
    }
  };

  setOpen = (open: boolean) => {
    const { onChange } = this.props;
    if (this.props.open == null) {
      this.setState({ open });
    }
    if (onChange != null) {
      onChange(open);
    }
  };
}
