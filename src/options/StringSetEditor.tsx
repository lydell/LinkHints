import { h, VNode } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";

import { timeout } from "../shared/main";
import TextInput from "./TextInput";

type Reason = "blur" | "input";

export default function StringSetEditor({
  save,
  id,
  savedValue,
}: {
  savedValue: Set<string>;
  save: (set: Set<string>, reason: Reason) => void;
  id?: string;
}): VNode {
  const [hasFocus, setHasFocus] = useState<boolean>(false);
  const [stateValue, setStateValue] = useState<Array<string> | undefined>(
    undefined
  );

  const value = stateValue != null ? stateValue : Array.from(savedValue);
  const endsWithBlank =
    value.length > 0 && value[value.length - 1].trim() === "";

  useLayoutEffect(
    () =>
      // Normalize on blur, but not when moving to the next field.
      !hasFocus && stateValue != null
        ? timeout(0, () => {
            setStateValue(undefined);
          })
        : undefined,
    [hasFocus, stateValue]
  );

  return (
    <div
      className="SpacedVertical"
      onBlurCapture={() => {
        setHasFocus(false);
      }}
      onFocusCapture={() => {
        setHasFocus(true);
      }}
    >
      {value.concat(endsWithBlank ? [] : [""]).map((item, index) => (
        <TextInput
          key={index}
          id={index === 0 ? id : undefined}
          savedValue={item}
          normalize={(newValue) => newValue.trim()}
          save={(newItem, reason) => {
            const newValue =
              index === value.length
                ? newItem.trim() === ""
                  ? value
                  : value.concat(newItem)
                : value.map((item2, index2) =>
                    index2 === index ? newItem : item2
                  );
            setStateValue(newValue);
            save(new Set(newValue), reason);
          }}
          onKeyDown={(event: KeyboardEvent) => {
            const { target } = event;
            if (target instanceof HTMLElement && event.key === "Enter") {
              const next = target.nextElementSibling;
              if (next != null && next instanceof HTMLInputElement) {
                next.select();
              }
            }
          }}
        />
      ))}
    </div>
  );
}
