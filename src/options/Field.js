// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  id: string,
  connectTop: boolean,
  label: React.Node,
  span: boolean,
  description: React.Node,
  changed: boolean,
  changedRight: boolean,
  render: ({| id: string |}) => React.Node,
|};

Field.defaultProps = {
  connectTop: false,
  span: false,
  changedRight: false,
};

export default function Field({
  id,
  connectTop,
  label,
  span,
  description,
  changed,
  changedRight,
  render,
}: Props) {
  return (
    <div
      className={classlist("Field", {
        "is-connectTop": connectTop,
        "is-changed": changed,
        "is-changedRight": changedRight,
      })}
    >
      {span ? (
        <span className="Field-label">{label}</span>
      ) : (
        <label htmlFor={id} className="Field-label">
          {label}
        </label>
      )}
      {render({ id })}
      {description != null && (
        <div className="Field-description">{description}</div>
      )}
    </div>
  );
}
