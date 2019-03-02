// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {
  id: string,
  label: React.Node,
  description: React.Node,
  changed: boolean,
  changedRight: boolean,
  render: ({| id: string |}) => React.Node,
};

Field.defaultProps = {
  changedRight: false,
};

export default function Field({
  id,
  label,
  description,
  changed,
  changedRight,
  render,
}: Props) {
  return (
    <div
      className={classlist("Field", {
        "is-changed": changed,
        "is-changedRight": changedRight,
      })}
    >
      <label htmlFor={id} className="Field-label">
        {label}
      </label>
      {render({ id })}
      {description != null && (
        <div className="Field-description">{description}</div>
      )}
    </div>
  );
}
