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
  normalizeFiniteNumber,
} from "../shared/main";
import { type TweakableValue, stringArrayToSet } from "../shared/tweakable";
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
}: {|
  namespace: string,
  name: string,
  value: T,
  defaultValue: T,
|}) {
  const fullKey = `${namespace}.${name}`;
  const fieldProps = {
    id: fullKey,
    label: `${namespace}: ${name}`,
  };

  if (typeof value === "number" && typeof defaultValue === "number") {
    return (
      <Field
        {...fieldProps}
        changed={value !== defaultValue}
        render={({ id }) => (
          <TextInput
            id={id}
            style={{ width: "33%" }}
            savedValue={String(value)}
            normalize={newValue =>
              normalizeFiniteNumber(newValue, defaultValue)
            }
            save={newValue => {
              save(fullKey, Number(newValue));
            }}
          />
        )}
      />
    );
  }

  if (typeof value === "string" && typeof defaultValue === "string") {
    return (
      <Field
        {...fieldProps}
        changed={value !== defaultValue}
        render={({ id }) => (
          <TextInput
            id={id}
            style={{ width: "100%" }}
            savedValue={value}
            normalize={newValue => {
              const trimmed = newValue.trim();
              return trimmed === "" ? defaultValue : trimmed;
            }}
            save={newValue => {
              save(fullKey, newValue);
            }}
          />
        )}
      />
    );
  }

  if (value instanceof Set && defaultValue instanceof Set) {
    return (
      <Field
        {...fieldProps}
        changed={!equalStringSets(value, defaultValue)}
        render={({ id }) => (
          <StringSetEditor
            id={id}
            savedValue={value}
            save={newValue => {
              const newSet = stringArrayToSet(newValue);
              save(fullKey, newSet.size === 0 ? defaultValue : newValue);
            }}
          />
        )}
      />
    );
  }

  const types = new Set(
    [value, defaultValue].map(val => ({}.toString.call(val)))
  );
  return (
    <Field
      {...fieldProps}
      span
      changed={false}
      render={() => (
        <p className="Error">Unknown type {Array.from(types).join(" / ")}.</p>
      )}
    />
  );
}

function save(key: string, value: mixed) {
  browser.storage.sync.set({ [key]: value }).catch(error => {
    log("error", "TweakableField", "Failed to save.", error);
  });
}
