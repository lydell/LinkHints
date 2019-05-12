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
import { deepEqual, log } from "../shared/main";
import { type TweakableValue } from "../shared/tweakable";
import {
  t as tElementManager,
  tMeta as tMetaElementManager,
} from "../worker/ElementManager";
import Field from "./Field";
import TextInput from "./TextInput";

const ALL_TWEAKABLES = [
  [tBackground, tMetaBackground],
  [tRenderer, tMetaRenderer],
  [tElementManager, tMetaElementManager],
];

type Props = {|
  before?: React.Node,
|};

type State = {||};

export default class Tweakable extends React.Component<Props, State> {
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
            normalize={newValue => normalizeNumber(newValue, defaultValue)}
            save={newValue => {
              log("log", "SAVE", newValue);
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
            save={newValue => {
              log("log", "SAVE", newValue);
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
        changed={
          !deepEqual(
            normalizeStringSet(value),
            normalizeStringSet(defaultValue)
          )
        }
        render={({ id }) => (
          <div className="SpacedVertical">
            {Array.from(value)
              .sort()
              .map((item, index) => (
                <TextInput
                  key={index}
                  id={index === 0 ? id : undefined}
                  savedValue={item}
                  save={newValue => {
                    log("log", "SAVE", newValue);
                  }}
                />
              ))}
          </div>
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

function normalizeNumber(value: string, defaultValue: number): string {
  const parsed = parseFloat(value);
  return String(Number.isFinite(parsed) ? parsed : defaultValue);
}

function normalizeStringSet(set: Set<string>): Array<string> {
  return Array.from(set).sort();
}
