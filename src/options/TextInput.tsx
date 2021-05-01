// @flow strict-local

import * as React from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

import { classlist, timeout } from "../shared/main";

const SAVE_TIMEOUT = 200; // ms

type Reason = "input" | "blur";

export default function TextInput({
  savedValue,
  normalize = (string: string) => string,
  save: saveProp,
  textarea = false,
  className = "",
  onKeyDown,
  ...restProps
}: {
  savedValue: string,
  normalize?: (string) => string,
  save?: (string, Reason) => void,
  textarea?: boolean,
  className?: string,
  onKeyDown?: (SyntheticKeyboardEvent<HTMLInputElement>) => void,
  ...
}) {
  const Tag = textarea ? "textarea" : "input";
  const readonly = saveProp == null;

  const [focused, setFocused] = useState<boolean>(false);
  const [stateValue, setStateValue] = useState<string | void>(undefined);

  const value = stateValue != null ? stateValue : savedValue;

  const saveRef = useRef();
  saveRef.current = saveProp;

  const normalizeRef = useRef(normalize);
  normalizeRef.current = normalize;

  const selectionStartRef = useRef<number>(0);
  const selectionEndRef = useRef<number>(0);
  const rootRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function storeSelection() {
    const element = rootRef.current;
    if (element != null) {
      selectionStartRef.current = element.selectionStart;
      selectionEndRef.current = element.selectionEnd;
    }
  }

  function restoreSelection() {
    const element = rootRef.current;
    if (element != null) {
      element.selectionStart = selectionStartRef.current;
      element.selectionEnd = selectionEndRef.current;
    }
  }

  useLayoutEffect(
    () =>
      // Move the default cursor position from the end of the textarea to the start.
      textarea ? restoreSelection() : undefined,
    [textarea]
  );

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
            if (save != null) {
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
      spellCheck="false"
      onInput={(
        event: SyntheticInputEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => {
        if (readonly) {
          // This is like the `readonly` attribute, but with a visible cursor,
          // which is nice when selecting parts of the text for copying.
          event.currentTarget.value = value;
          restoreSelection();
        } else {
          setStateValue(event.target.value);
        }
      }}
      onKeyDown={(event) => {
        storeSelection();
        if (onKeyDown != null) {
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
        if (normalizedValue !== savedValue && saveProp != null) {
          saveProp(normalizedValue, "blur");
        }
      }}
    />
  );
}
