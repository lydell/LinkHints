// This file is allowed to import `tweakable` objects from the other programs.
// Thanks to Rollup this does not blow up the bundle size.
/* eslint-disable import/no-restricted-paths */

import { h, VNode } from "preact";
import { useEffect, useRef } from "preact/hooks";

import {
  t as tBackground,
  tMeta as tMetaBackground,
} from "../background/Program";
import { t as tRenderer, tMeta as tMetaRenderer } from "../renderer/Program";
import {
  addListener,
  fireAndForget,
  normalizeUnsignedFloat,
  normalizeUnsignedInt,
} from "../shared/main";
import { DEBUG_PREFIX } from "../shared/options";
import {
  normalizeStringArray,
  TweakableMeta,
  TweakableValue,
} from "../shared/tweakable";
import {
  t as tElementManager,
  tMeta as tMetaElementManager,
} from "../worker/ElementManager";
import { t as tWorker, tMeta as tMetaWorker } from "../worker/Program";
import Field from "./Field";
import StringSetEditor from "./StringSetEditor";
import TextInput from "./TextInput";

const ALL_TWEAKABLES: Array<[Record<string, TweakableValue>, TweakableMeta]> = [
  [tBackground, tMetaBackground],
  [tWorker, tMetaWorker],
  [tRenderer, tMetaRenderer],
  [tElementManager, tMetaElementManager],
];

const ALL_KEYS = new Set<string>(
  ALL_TWEAKABLES.flatMap(([, tMeta]) =>
    Object.keys(tMeta.defaults).map(
      (key) => `${DEBUG_PREFIX}${tMeta.namespace}.${key}`
    )
  )
);

export default function Tweakable({
  before,
  onUpdate,
}: {
  before?: VNode;
  onUpdate: () => void;
}): VNode {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(
    () =>
      addListener(
        browser.storage.onChanged,
        (changes, areaName) => {
          if (areaName === "sync") {
            const didUpdate = Object.keys(changes).some((key) =>
              ALL_KEYS.has(key)
            );
            if (didUpdate) {
              onUpdateRef.current();
            }
          }
        },
        "Tweakable storage.onChanged listener"
      ),
    []
  );

  return (
    <div>
      {before}

      {ALL_TWEAKABLES.map(([t, tMeta]) =>
        Object.keys(tMeta.defaults)
          .sort()
          .map((key) => {
            const { [key]: changed = false } = tMeta.changed;
            return (
              <TweakableField
                key={`${tMeta.namespace}.${key}`}
                namespace={tMeta.namespace}
                name={key}
                value={t[key]}
                defaultValue={tMeta.defaults[key]}
                changed={changed}
                error={tMeta.errors[key]}
              />
            );
          })
      )}
    </div>
  );
}

function TweakableField({
  namespace,
  name,
  value,
  defaultValue,
  changed,
  error,
}: {
  namespace: string;
  name: string;
  value: TweakableValue;
  defaultValue: TweakableValue;
  changed: boolean;
  error: string | undefined;
}): VNode {
  const fullKey = `${DEBUG_PREFIX}${namespace}.${name}`;

  const reset = (): void => {
    save(fullKey, undefined);
  };

  const fieldProps = {
    id: fullKey,
    label: `${namespace}: ${name}`,
    changed,
    description:
      error !== undefined ? (
        <div className="Error SpacedVertical">
          <p>
            There was an error with the saved value. Using default instead.{" "}
            <button type="button" onClick={reset}>
              Remove
            </button>
          </p>
          <pre>{error}</pre>
        </div>
      ) : undefined,
    onReset: reset,
  };

  switch (value.type) {
    case "UnsignedInt":
      if (defaultValue.type === "UnsignedInt") {
        return (
          <Field
            {...fieldProps}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "50%" }}
                savedValue={value.value.toString()}
                normalize={(newValue) =>
                  normalizeUnsignedInt(newValue, defaultValue.value)
                }
                save={(newValue) => {
                  save(fullKey, Number(newValue));
                }}
              />
            )}
          />
        );
      }
      break;

    case "UnsignedFloat":
      if (defaultValue.type === "UnsignedFloat") {
        return (
          <Field
            {...fieldProps}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "50%" }}
                savedValue={value.value.toString()}
                normalize={(newValue) =>
                  normalizeUnsignedFloat(newValue, defaultValue.value)
                }
                save={(newValue) => {
                  save(fullKey, Number(newValue));
                }}
              />
            )}
          />
        );
      }
      break;

    case "StringSet":
      if (defaultValue.type === "StringSet") {
        return (
          <Field
            {...fieldProps}
            render={({ id }) => (
              <StringSetEditor
                id={id}
                savedValue={value.value}
                save={(newValue) => {
                  save(fullKey, normalizeStringArray(newValue));
                }}
              />
            )}
          />
        );
      }
      break;

    case "ElementTypeSet":
      if (defaultValue.type === "ElementTypeSet") {
        return (
          <Field
            {...fieldProps}
            render={({ id }) => (
              <StringSetEditor
                id={id}
                savedValue={new Set(value.value)}
                save={(newValue) => {
                  save(fullKey, normalizeStringArray(newValue));
                }}
              />
            )}
          />
        );
      }
      break;

    case "SelectorString":
      if (defaultValue.type === "SelectorString") {
        return (
          <Field
            {...fieldProps}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "100%" }}
                savedValue={value.value}
                normalize={(newValue) => {
                  const trimmed = newValue.trim();
                  return trimmed === "" ? defaultValue.value : trimmed;
                }}
                save={(newValue) => {
                  save(fullKey, newValue);
                }}
              />
            )}
          />
        );
      }
      break;
  }

  return (
    <Field
      {...fieldProps}
      span
      render={() => (
        <p className="Error">
          Value/defaultValue type mismatch: {value.type}/{defaultValue.type}.
        </p>
      )}
    />
  );
}

function save(key: string, value: unknown): void {
  fireAndForget(
    value === undefined
      ? browser.storage.sync.remove(key)
      : browser.storage.sync.set({ [key]: value }),
    "TweakableField save",
    { key, value }
  );
}

export function hasChangedTweakable(): boolean {
  return ALL_TWEAKABLES.some(([, tMeta]) =>
    Object.values(tMeta.changed).some(Boolean)
  );
}

export function getTweakableExport(): Record<string, unknown> {
  return Object.fromEntries(
    ALL_TWEAKABLES.flatMap(([t, tMeta]) =>
      Object.keys(tMeta.defaults).flatMap(
        (key): Array<[string, unknown]> => {
          const { value } = t[key];
          const { [key]: changed = false } = tMeta.changed;
          return changed
            ? [
                [
                  `${DEBUG_PREFIX}${tMeta.namespace}.${key}`,
                  value instanceof Set ? Array.from(value) : value,
                ],
              ]
            : [];
        }
      )
    )
  );
}

export function partitionTweakable(
  data: Record<string, unknown>
): [Record<string, unknown>, Record<string, unknown>] {
  const tweakableData: Record<string, unknown> = {};
  const otherData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (ALL_KEYS.has(key)) {
      tweakableData[key] = value;
    } else {
      otherData[key] = value;
    }
  }

  return [tweakableData, otherData];
}

export async function saveTweakable(
  data: Record<string, unknown>
): Promise<void> {
  const [tweakableData] = partitionTweakable(data);
  return browser.storage.sync.set(tweakableData);
}
