// @flow strict-local

import { array, chain, Decoder, repr, string } from "tiny-decoders";

import { ElementType } from "./hints";
import {
  addListener,
  deepEqual,
  log,
  UnsignedFloat,
  UnsignedInt,
} from "./main";
import { DEBUG_PREFIX } from "./options";

type UnsignedInt = {
  type: "UnsignedInt";
  value: number;
};

type UnsignedFloat = {
  type: "UnsignedFloat";
  value: number;
};

type StringSet = {
  type: "StringSet";
  value: Set<string>;
};

type ElementTypeSet = {
  type: "ElementTypeSet";
  value: Set<ElementType>;
};

type SelectorString = {
  type: "SelectorString";
  value: string;
};

export type TweakableValue =
  | ElementTypeSet
  | SelectorString
  | StringSet
  | UnsignedFloat
  | UnsignedInt;

export type TweakableMapping = { [key: string]: TweakableValue };

export type TweakableMeta = {
  namespace: string;
  defaults: TweakableMapping;
  changed: { [key: string]: boolean };
  errors: { [key: string]: string | undefined };
  loaded: Promise<void>;
  unlisten: () => void;
};

export function unsignedInt(value: number): UnsignedInt {
  return {
    type: "UnsignedInt",
    value,
  };
}

export function unsignedFloat(value: number): UnsignedFloat {
  return {
    type: "UnsignedFloat",
    value,
  };
}

export function stringSet(value: Set<string>): StringSet {
  return {
    type: "StringSet",
    value,
  };
}

export function elementTypeSet(value: Set<ElementType>): ElementTypeSet {
  return {
    type: "ElementTypeSet",
    value,
  };
}

export function selectorString(value: string): SelectorString {
  return {
    type: "SelectorString",
    value,
  };
}

export function tweakable(
  namespace: string,
  mapping: TweakableMapping
): TweakableMeta {
  const prefix = "tweakable";
  const keyPrefix = `${DEBUG_PREFIX}${namespace}.`;
  const defaults = { ...mapping };
  const changed: { [key: string]: boolean } = {};
  const errors: { [key: string]: string | undefined } = {};

  function update(data: { [key: string]: unknown }): void {
    for (const [key, value] of Object.entries(data)) {
      try {
        if (!{}.hasOwnProperty.call(defaults, key)) {
          throw new TypeError(`Unknown key: ${repr(key)}`);
        }

        const original: TweakableValue = defaults[key];
        errors[key] = undefined;
        changed[key] = false;

        if (value == null) {
          mapping[key] = original;
          continue;
        }

        switch (original.type) {
          case "UnsignedInt": {
            const decoded = UnsignedInt(value);
            mapping[key] = {
              type: "UnsignedInt",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }

          case "UnsignedFloat": {
            const decoded = UnsignedFloat(value);
            mapping[key] = {
              type: "UnsignedFloat",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }

          case "StringSet": {
            const decoded = StringSet(string)(value);
            mapping[key] = {
              type: "StringSet",
              value: decoded,
            };
            changed[key] = !equalStringSets(decoded, original.value);
            break;
          }

          case "ElementTypeSet": {
            const decoded: Set<ElementType> = StringSet(ElementType)(value);
            mapping[key] = {
              type: "ElementTypeSet",
              value: decoded,
            };
            changed[key] = !equalStringSets(
              new Set(decoded),
              new Set(original.value)
            );
            break;
          }

          case "SelectorString": {
            // eslint-disable-next-line @typescript-eslint/no-loop-func
            const decoded = chain(string, (val) => {
              document.querySelector(val);
              return val;
            })(value);
            mapping[key] = {
              type: "SelectorString",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }
        }
      } catch (errorAny) {
        const error = errorAny as Error;
        errors[key] = error.message;
      }
    }
  }

  const loaded = browser.storage.sync
    .get(Object.keys(defaults).map((key) => `${keyPrefix}${key}`))
    .then((rawData) => {
      const data = Object.fromEntries(
        Object.entries(rawData).map(([fullKey, value]) => [
          fullKey.slice(keyPrefix.length),
          value,
        ])
      );
      update(data);
    })
    .catch((error: Error) => {
      log("error", prefix, "First load failed.", {
        namespace,
        mapping,
        error,
      });
    });

  const unlisten = addListener(
    browser.storage.onChanged,
    (changes, areaName) => {
      if (areaName === "sync") {
        const data = Object.fromEntries(
          Object.keys(changes).flatMap((fullKey) => {
            if (fullKey.startsWith(keyPrefix)) {
              const key = fullKey.slice(keyPrefix.length);
              if ({}.hasOwnProperty.call(defaults, key)) {
                return [[key, changes[fullKey].newValue]];
              }
            }
            return [];
          })
        );
        update(data);
      }
    }
  );

  return {
    namespace,
    defaults,
    changed,
    errors,
    loaded,
    unlisten,
  };
}

export function normalizeStringArray(
  arrayOrSet: Array<string> | Set<string>
): Array<string> {
  return Array.from(arrayOrSet)
    .map((item) => item.trim())
    .filter((item) => item !== "")
    .sort();
}

function StringSet<T extends string>(decoder: Decoder<T>): Decoder<Set<T>> {
  return chain(
    array(string),
    (arr) => new Set(array(decoder)(normalizeStringArray(arr)))
  );
}

function equalStringSets(a: Set<string>, b: Set<string>): boolean {
  return deepEqual(normalizeStringArray(a), normalizeStringArray(b));
}
