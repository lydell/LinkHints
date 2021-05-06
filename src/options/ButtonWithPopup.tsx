import { h, JSX, VNode } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import { addEventListener, classlist, Resets } from "../shared/main";

export default function ButtonWithPopup({
  open: openProp,
  buttonContent,
  popupContent,
  onOpenChange,
  className = "",
  ...restProps
}: JSX.HTMLAttributes<HTMLButtonElement> & {
  buttonContent: VNode | string;
  popupContent: (options: { close: () => void }) => VNode;
  open?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
}): VNode {
  const onChangeRef = useRef<((isOpen: boolean) => void) | undefined>();
  onChangeRef.current = onOpenChange;

  const [openState, setOpenState] = useState<boolean>(false);

  const open = openProp != null ? openProp : openState;

  const rootRef = useRef<HTMLDivElement>();

  const setOpen = useCallback(
    (newOpen: boolean) => {
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
      function closeIfOutside(event: Event): void {
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
