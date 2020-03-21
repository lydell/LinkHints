// @flow strict-local

import * as React from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { addEventListener, classlist, Resets } from "../shared/main";

export default function ButtonWithPopup({
  open: openProp,
  buttonContent,
  popupContent,
  onChange,
  className = "",
  ...restProps
}: {
  buttonContent: React.Node,
  popupContent: ({ close: () => void }) => React.Node,
  open?: boolean,
  onChange?: (boolean) => void,
  className?: string,
  ...
}) {
  const onChangeRef = useRef();
  onChangeRef.current = onChange;

  const [openState, setOpenState] = useState<boolean>(false);

  const open = openProp != null ? openProp : openState;

  const rootRef = useRef();

  const setOpen = useCallback(
    (newOpen) => {
      if (openProp == null) {
        setOpenState(newOpen);
      }
      if (onChangeRef.current != null) {
        onChangeRef.current(newOpen);
      }
    },
    [openProp]
  );

  useEffect(() => {
    if (open) {
      function closeIfOutside(event: Event) {
        const root = rootRef.current;
        const { target } = event;

        if (
          root != null &&
          target instanceof Node &&
          !root.contains(target) &&
          target !== document
        ) {
          setOpen(false);
        }
      }

      const resets = new Resets();
      resets.add(
        addEventListener(window, "focus", closeIfOutside),
        addEventListener(window, "click", closeIfOutside)
      );

      return () => {
        resets.reset();
      };
    }

    return undefined;
  }, [open, setOpen]);

  return (
    <div
      className={classlist("ButtonWithPopup", { "is-open": open })}
      ref={rootRef}
    >
      <button
        {...restProps}
        type="button"
        className={classlist("ButtonWithPopup-button", className)}
        onClick={() => {
          setOpen(!open);
        }}
      >
        {buttonContent}
      </button>

      {open && (
        <div className="ButtonWithPopup-popup">
          {popupContent({
            close: () => {
              setOpen(false);
            },
          })}
        </div>
      )}
    </div>
  );
}
