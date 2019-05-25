// This file is allowed to import `tweakable` objects from the other programs.
// Thanks to Rollup this does not blow up the bundle size.
/* eslint-disable import/no-restricted-paths */

// @flow strict-local

import * as React from "preact";

import {
  t as tBackground,
  tMeta as tMetaBackground,
} from "../background/Program";
import { t as tRenderer, tMeta as tMetaRenderer } from "../renderer/Program";
import {
  Resets,
  addListener,
  log,
  normalizeUnsignedFloat,
  normalizeUnsignedInt,
  unreachable,
} from "../shared/main";
import { type TweakableValue, normalizeStringArray } from "../shared/tweakable";
import {
  t as tElementManager,
  tMeta as tMetaElementManager,
} from "../worker/ElementManager";
import Field from "./Field";
import StringSetEditor, { equalStringSets } from "./StringSetEditor";
import TextInput from "./TextInput";

const ALL_TWEAKABLES = [
  [tBackground, tMetaBackground],
  [tRenderer, tMetaRenderer],
  [tElementManager, tMetaElementManager],
];

const ALL_KEYS: Set<string> = new Set(
  [].concat(
    ...ALL_TWEAKABLES.map(([, tMeta]) =>
      Object.keys(tMeta.defaults).map(key => `${tMeta.namespace}.${key}`)
    )
  )
);

type Props = {|
  before?: React.Node,
|};

type State = {||};

export default class Tweakable extends React.Component<Props, State> {
  resets: Resets = new Resets();

  componentDidMount() {
    this.resets.add(
      addListener(browser.storage.onChanged, (changes, areaName) => {
        if (areaName === "sync") {
          const didUpdate = Object.keys(changes).some(key => ALL_KEYS.has(key));
          if (didUpdate) {
            this.forceUpdate();
          }
        }
      })
    );
  }

  componentWillUnmount() {
    this.resets.reset();
  }

  render() {
    const { before } = this.props;

    return (
      <div>
        <div />

        {before}

        {ALL_TWEAKABLES.map(([t, tMeta]) =>
          Object.keys(tMeta.defaults)
            .sort()
            .map(key => {
              return (
                <TweakableField
                  key={`${tMeta.namespace}.${key}`}
                  namespace={tMeta.namespace}
                  name={key}
                  value={t[key]}
                  defaultValue={tMeta.defaults[key]}
                  error={tMeta.errors[key]}
                />
              );
            })
        )}
      </div>
    );
  }
}

function TweakableField<T: TweakableValue>({
  namespace,
  name,
  value,
  defaultValue,
  error,
}: {|
  namespace: string,
  name: string,
  value: T,
  defaultValue: T,
  error: ?string,
|}) {
  const fullKey = `${namespace}.${name}`;
  const fieldProps = {
    id: fullKey,
    label: `${namespace}: ${name}`,
    description:
      error != null ? (
        <div className="Error SpacedVertical">
          <p>There was an error with the saved value. Using default instead.</p>
          <pre>{error}</pre>
        </div>
      ) : (
        undefined
      ),
  };

  switch (value.type) {
    case "UnsignedInt":
      if (defaultValue.type === "UnsignedInt") {
        return (
          <Field
            {...fieldProps}
            changed={value.value !== defaultValue.value}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "33%" }}
                savedValue={String(value.value)}
                normalize={newValue =>
                  normalizeUnsignedInt(newValue, defaultValue.value)
                }
                save={newValue => {
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
            changed={value.value !== defaultValue.value}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "33%" }}
                savedValue={String(value.value)}
                normalize={newValue =>
                  normalizeUnsignedFloat(newValue, defaultValue.value)
                }
                save={newValue => {
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
            changed={!equalStringSets(value.value, defaultValue.value)}
            render={({ id }) => (
              <StringSetEditor
                id={id}
                savedValue={value.value}
                save={newValue => {
                  const newArray = normalizeStringArray(newValue);
                  save(
                    fullKey,
                    newArray.length === 0
                      ? Array.from(defaultValue.value)
                      : newValue
                  );
                }}
              />
            )}
          />
        );
      }
      break;

    case "ElementTypeSet":
      if (defaultValue.type === "ElementTypeSet") {
        const stringValue: Set<string> = new Set(value.value);
        const defaulStringValue: Set<string> = new Set(defaultValue.value);
        return (
          <Field
            {...fieldProps}
            changed={!equalStringSets(stringValue, defaulStringValue)}
            render={({ id }) => (
              <StringSetEditor
                id={id}
                savedValue={stringValue}
                save={newValue => {
                  const newArray = normalizeStringArray(newValue);
                  save(
                    fullKey,
                    newArray.length === 0
                      ? Array.from(defaultValue.value)
                      : newValue
                  );
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
            changed={value.value !== defaultValue.value}
            render={({ id }) => (
              <TextInput
                id={id}
                style={{ width: "100%" }}
                savedValue={value.value}
                normalize={newValue => {
                  const trimmed = newValue.trim();
                  return trimmed === "" ? defaultValue.value : trimmed;
                }}
                save={newValue => {
                  save(fullKey, newValue);
                }}
              />
            )}
          />
        );
      }
      break;

    default:
      unreachable(value.type, value);
  }

  return (
    <Field
      {...fieldProps}
      span
      changed={false}
      render={() => (
        <p className="Error">
          Value/defaultValue type mismatch: {value.type}/{defaultValue.type}.
        </p>
      )}
    />
  );
}

async function save(key: string, value: mixed) {
  try {
    await browser.storage.sync.set({ [key]: value });
  } catch (error) {
    log("error", "TweakableField", "Failed to save.", error);
  }
}
