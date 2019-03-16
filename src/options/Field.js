// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  id: string,
  connected: boolean,
  label: React.Node,
  span: boolean,
  description: React.Node,
  changed: boolean,
  changedRight: boolean,
  render: ({| id: string |}) => React.Node,
|};

Field.defaultProps = {
  connected: false,
  span: false,
  changedRight: false,
};

export default function Field({
  id,
  connected,
  label,
  span,
  description,
  changed,
  changedRight,
  render,
}: Props) {
  return (
    <div
      className={classlist("Field", "SpacedVertical", {
        "is-connected": connected,
        "is-changed": changed,
        "is-changedRight": changedRight,
      })}
    >
      <div>
        {span ? (
          <span className="Field-label">{label}</span>
        ) : (
          <label htmlFor={id} className="Field-label">
            {label}
          </label>
        )}

        {render({ id })}
      </div>

      {description != null && (
        <div className="TextSmall">{description}</div>
      )}
    </div>
  );
}
