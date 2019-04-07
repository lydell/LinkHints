// @flow strict-local

import React from "preact";

import { classlist } from "../shared/main";

type Props = {|
  id: string,
  connected?: boolean,
  fullWidth?: boolean,
  label: React.Node,
  span?: boolean,
  description?: React.Node,
  changed: boolean,
  changedRight?: boolean,
  render: ({| id: string |}) => React.Node,
|};

export default function Field({
  id,
  connected = false,
  fullWidth = false,
  label,
  span = false,
  description,
  changed,
  changedRight = false,
  render,
}: Props) {
  return (
    <div
      className={classlist("Field", "SpacedVertical", {
        "is-connected": connected,
        "is-fullWidth": fullWidth,
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
        <div className="Field-description TextSmall">{description}</div>
      )}
    </div>
  );
}
