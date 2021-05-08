import { h, JSX, VNode } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { classlist, timeout } from "../shared/main";

const SAVE_TIMEOUT = 200; // ms

type Reason = "blur" | "input";

export default function TextInput({
  savedValue,
  normalize = (string: string) => string,
  save: saveProp,
  textarea = false,
  className = "",
  onKeyDown,
  ...restProps
}: JSX.HTMLAttributes<HTMLInputElement> &
  JSX.HTMLAttributes<HTMLTextAreaElement> & {
    savedValue: string;
    normalize?: (text: string) => string;
    save?: (text: string, reason: Reason) => void;
    textarea?: boolean;
    className?: string;
    onKeyDown?: (event: KeyboardEvent) => void;
  }): VNode {
  // `as "input"` is there because I could not figure out how to make `onInput` type-check otherwise.
  const Tag = textarea ? ("textarea" as "input") : "input";
  const readonly = saveProp === undefined;

  const [focused, setFocused] = useState<boolean>(false);
  const [stateValue, setStateValue] = useState<string | undefined>(undefined);

  const value = stateValue !== undefined ? stateValue : savedValue;

  const saveRef = useRef<
    ((text: string, reason: Reason) => void) | undefined
  >();
  saveRef.current = saveProp;

  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;

  const selectionStartRef = useRef<number>(0);
  const selectionEndRef = useRef<number>(0);
  const rootRef = useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null);

  function storeSelection(): void {
    const element = rootRef.current;
    if (element !== null) {
      selectionStartRef.current = element.selectionStart;
      selectionEndRef.current = element.selectionEnd;
    }
  }

  function restoreSelection(): void {
    const element = rootRef.current;
    if (element !== null) {
      element.selectionStart = selectionStartRef.current;
      element.selectionEnd = selectionEndRef.current;
    }
  }

  useLayoutEffect(() => {
    // Move the default cursor position from the end of the textarea to the start.
    if (textarea) {
      restoreSelection();
    }
  }, [textarea]);

  useLayoutEffect(() => {
    // When readonly textareas change, move the cursor back to the start.
    if (textarea && readonly) {
      selectionStartRef.current = 0;
      selectionEndRef.current = 0;
      return timeout(0, restoreSelection);
    }
    return undefined;
  }, [textarea, readonly, savedValue]);

  useEffect(
    () =>
      // Save after `SAVE_TIMEOUT` ms has passed since the last input.
      focused && !readonly
        ? timeout(SAVE_TIMEOUT, () => {
            const save = saveRef.current;
            if (save !== undefined) {
              const normalizedValue = normalizeRef.current(value);
              if (normalizedValue !== savedValue) {
                save(normalizedValue, "input");
              }
            }
          })
        : undefined,
    [focused, readonly, savedValue, value]
  );

  return (
    <Tag
      {...restProps}
      ref={rootRef}
      className={classlist(className, { "is-readonly": readonly })}
      value={value}
      spellcheck={false}
      onInput={(event) => {
        if (readonly) {
          // This is like the `readonly` attribute, but with a visible cursor,
          // which is nice when selecting parts of the text for copying.
          event.currentTarget.value = value;
          restoreSelection();
        } else {
          setStateValue(event.currentTarget.value);
        }
      }}
      onKeyDown={(event: KeyboardEvent) => {
        storeSelection();
        if (onKeyDown !== undefined) {
          onKeyDown(event);
        }
      }}
      onMouseDown={() => {
        storeSelection();
      }}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);

        // Normalize on blur.
        setStateValue(undefined);

        // Save on blur.
        const normalizedValue = normalize(value);
        if (normalizedValue !== savedValue && saveProp !== undefined) {
          saveProp(normalizedValue, "blur");
        }
      }}
    />
  );
}
