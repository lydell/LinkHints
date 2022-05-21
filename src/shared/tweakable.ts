import {
  array,
  boolean,
  chain,
  Decoder,
  DecoderError,
  string,
} from "tiny-decoders";

import { ElementType } from "./hints";
import {
  addListener,
  decode,
  deepEqual,
  log,
  UnsignedFloat,
  UnsignedInt,
} from "./main";
import { DEBUG_PREFIX } from "./options";

type Bool = {
  type: "Bool";
  value: boolean;
};

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

type Regex = {
  type: "Regex";
  value: RegExp;
};

export type TweakableValue =
  | Bool
  | ElementTypeSet
  | Regex
  | SelectorString
  | StringSet
  | UnsignedFloat
  | UnsignedInt;

export type TweakableMapping = Record<string, TweakableValue>;

export type TweakableMeta = {
  namespace: string;
  defaults: TweakableMapping;
  changed: Record<string, boolean>;
  errors: Record<string, string | undefined>;
  loaded: Promise<void>;
  unlisten: () => void;
};

export function bool(value: boolean): Bool {
  return {
    type: "Bool",
    value,
  };
}

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

export function regex(value: RegExp): Regex {
  return {
    type: "Regex",
    value,
  };
}

export function tweakable(
  namespace: string,
  mapping: TweakableMapping
): TweakableMeta {
  const keyPrefix = `${DEBUG_PREFIX}${namespace}.`;
  const defaults = { ...mapping };
  const changed: Record<string, boolean> = {};
  const errors: Record<string, string | undefined> = {};

  function update(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      try {
        if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
          throw new DecoderError({
            message: "Unknown key",
            value: DecoderError.MISSING_VALUE,
            key,
          });
        }

        const original: TweakableValue = defaults[key];
        errors[key] = undefined;
        changed[key] = false;

        if (value === undefined) {
          mapping[key] = original;
          continue;
        }

        switch (original.type) {
          case "Bool": {
            const decoded = decode(boolean, value);
            mapping[key] = {
              type: "Bool",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }

          case "UnsignedInt": {
            const decoded = decode(UnsignedInt, value);
            mapping[key] = {
              type: "UnsignedInt",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }

          case "UnsignedFloat": {
            const decoded = decode(UnsignedFloat, value);
            mapping[key] = {
              type: "UnsignedFloat",
              value: decoded,
            };
            changed[key] = decoded !== original.value;
            break;
          }

          case "StringSet": {
            const decoded = decode(StringSet(string), value);
            mapping[key] = {
              type: "StringSet",
              value: decoded,
            };
            changed[key] = !equalStringSets(decoded, original.value);
            break;
          }

          case "ElementTypeSet": {
            const decoded = decode(StringSet(ElementType), value);
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

          case "Regex": {
            const decoded = chain(string, (val) => new RegExp(val, "u"))(value);
            mapping[key] = {
              type: "Regex",
              value: decoded,
            };
            changed[key] = decoded.source !== original.value.source;
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
      log("error", "tweakable", "First load failed.", {
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
              if (Object.prototype.hasOwnProperty.call(defaults, key)) {
                return [[key, changes[fullKey].newValue]];
              }
            }
            return [];
          })
        );
        update(data);
      }
    },
    "tweakable storage.onChanged listener"
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
