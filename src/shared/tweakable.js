// @flow strict-local

import { array, map, number, repr, string } from "tiny-decoders";

import { addListener, log } from "./main";

export type TweakableMapping = { [string]: string | number | Set<string> };

export type TweakableMeta = {|
  namespace: string,
  defaults: TweakableMapping,
  loaded: Promise<void>,
  unlisten: () => void,
|};

export function tweakable(
  namespace: string,
  mapping: TweakableMapping
): TweakableMeta {
  const prefix = "tweakable";
  const keyPrefix = `${namespace}.`;
  const defaults = { ...mapping };

  function update(data: { [string]: mixed }) {
    for (const [key, value] of Object.entries(data)) {
      try {
        if (!{}.hasOwnProperty.call(defaults, key)) {
          throw new TypeError(`Unknown key: ${repr(key)}`);
        }
        const original = defaults[key];
        if (value == null) {
          mapping[key] = original;
        } else if (typeof original === "string") {
          mapping[key] = string(value);
        } else if (typeof original === "number") {
          mapping[key] = number(value);
        } else if (original instanceof Set) {
          mapping[key] = map(array(string), arr => new Set(arr))(value);
        } else {
          throw new TypeError(
            `Unknown type. Expected a string, number or a Set of string, but got: ${repr(
              value
            )}`
          );
        }
      } catch (error) {
        log("error", prefix, `Failed to decode ${JSON.stringify(key)}.`, {
          key,
          value,
          namespace,
          mapping,
          error,
        });
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
              result[key] = changes[key].newValue;
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
    loaded,
    unlisten,
  };
}
