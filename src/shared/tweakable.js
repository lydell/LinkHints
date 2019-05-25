// @flow strict-local

import { array, map, repr, string } from "tiny-decoders";

import { type ElementType, decodeElementType } from "./hints";
import {
  addListener,
  decodeUnsignedFloat,
  decodeUnsignedInt,
  log,
  unreachable,
} from "./main";

type UnsignedInt = {|
  type: "UnsignedInt",
  value: number,
|};

type UnsignedFloat = {|
  type: "UnsignedFloat",
  value: number,
|};

type StringSet = {|
  type: "StringSet",
  value: Set<string>,
|};

type ElementTypeSet = {|
  type: "ElementTypeSet",
  value: Set<ElementType>,
|};

type SelectorString = {|
  type: "SelectorString",
  value: string,
|};

export type TweakableValue =
  | UnsignedInt
  | UnsignedFloat
  | StringSet
  | ElementTypeSet
  | SelectorString;

export type TweakableMapping = { [string]: TweakableValue };

export type TweakableMeta = {|
  namespace: string,
  defaults: TweakableMapping,
  errors: { [string]: ?string },
  loaded: Promise<void>,
  unlisten: () => void,
|};

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
  const keyPrefix = `${namespace}.`;
  const defaults = { ...mapping };
  const errors: { [$Keys<typeof mapping>]: ?string } = {};

  function update(data: { [string]: mixed }) {
    for (const [key, value] of Object.entries(data)) {
      try {
        if (!{}.hasOwnProperty.call(defaults, key)) {
          throw new TypeError(`Unknown key: ${repr(key)}`);
        }

        const original: TweakableValue = defaults[key];

        if (value == null) {
          mapping[key] = original;
          continue;
        }

        switch (original.type) {
          case "UnsignedInt":
            mapping[key] = {
              type: "UnsignedInt",
              value: decodeUnsignedInt(value),
            };
            break;

          case "UnsignedFloat":
            mapping[key] = {
              type: "UnsignedFloat",
              value: decodeUnsignedFloat(value),
            };
            break;

          case "StringSet":
            mapping[key] = {
              type: "StringSet",
              value: decodeStringSet(string)(value),
            };
            break;

          case "ElementTypeSet":
            mapping[key] = {
              type: "ElementTypeSet",
              value: decodeStringSet(map(string, decodeElementType))(value),
            };
            break;

          case "SelectorString":
            mapping[key] = {
              type: "SelectorString",
              value: map(string, val => {
                document.querySelector(val);
                return val;
              })(value),
            };
            break;

          default:
            unreachable(original.type, original);
        }
        errors[key] = undefined;
      } catch (error) {
        errors[key] = error.message;
      }
    }
  }

  const loaded = browser.storage.sync
    .get(Object.keys(defaults).map(key => `${keyPrefix}${key}`))
    .then(rawData => {
      const data = Object.entries(rawData).reduce(
        (result, [fullKey, value]) => {
          const key = fullKey.slice(keyPrefix.length);
          result[key] = value;
          return result;
        },
        {}
      );
      update(data);
    })
    .catch(error => {
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
        const data = Object.keys(changes).reduce((result, fullKey) => {
          if (fullKey.startsWith(keyPrefix)) {
            const key = fullKey.slice(keyPrefix.length);
            if ({}.hasOwnProperty.call(defaults, key)) {
              result[key] = changes[fullKey].newValue;
            }
          }
          return result;
        }, {});
        update(data);
      }
    }
  );

  return {
    namespace,
    defaults,
    errors,
    loaded,
    unlisten,
  };
}

export function normalizeStringArray(arr: Array<string>): Array<string> {
  return arr
    .map(item => item.trim())
    .filter(item => item !== "")
    .sort();
}

function decodeStringSet<T: string>(decoder: mixed => T): mixed => Set<T> {
  return map(
    array(string),
    arr => new Set(array(decoder)(normalizeStringArray(arr)))
  );
}
